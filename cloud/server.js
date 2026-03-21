import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { InstanceGroupManagersClient, RegionInstanceGroupManagersClient } from '@google-cloud/compute';
import { ServicesClient } from '@google-cloud/run';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const REGION = process.env.REGION || 'us-central1';

// Initialize GCP Clients
const zonalMigClient = new InstanceGroupManagersClient();
const regionalMigClient = new RegionInstanceGroupManagersClient();
const runClient = new ServicesClient();

// Middleware
app.use(cors());
app.use(express.json());

// Basic Health Check Route
app.get('/', (req, res) => {
  res.status(200).send('AXiM Core Deployment Trigger Service is running.');
});

// Deployment Trigger Endpoint (Pub/Sub Push Subscription)
app.post('/pubsub/deploy', async (req, res) => {
  if (!req.body.message) {
    return res.status(400).send('Bad Request: missing message');
  }

  const message = req.body.message;
  const data = message.data ? Buffer.from(message.data, 'base64').toString().trim() : '{}';

  let payload;
  try {
    payload = JSON.parse(data);
  } catch (e) {
    console.error('Error parsing Pub/Sub message data:', e);
    return res.status(400).send('Invalid JSON payload');
  }

  const { imageTag } = payload;
  if (!imageTag) {
    console.error('Missing imageTag in payload');
    return res.status(400).send('Missing imageTag');
  }

  console.log(`Received deployment trigger for tag: ${imageTag}`);

  try {
    const promises = [];

    // 1. Update GCE Managed Instance Groups
    // Assumes Instance Templates are already created by CI/CD with naming convention:
    // axim-core-instance-template-frontend-<imageTag>
    // axim-core-instance-template-backend-<imageTag>

    promises.push(updateManagedInstanceGroup(
      'axim-core-mig-frontend',
      `axim-core-instance-template-frontend-${imageTag}`
    ));

    promises.push(updateManagedInstanceGroup(
      'axim-core-mig-backend',
      `axim-core-instance-template-backend-${imageTag}`
    ));

    // 2. Update Cloud Run Services (Async Worker services)
    promises.push(updateCloudRunService(
      'axim-core-async-producer-service',
      'axim-core-backend',
      imageTag
    ));

    promises.push(updateCloudRunService(
      'axim-core-async-consumer-service',
      'axim-core-backend',
      imageTag
    ));

    await Promise.all(promises);

    res.status(200).send('Deployment triggered successfully');
  } catch (error) {
    console.error('Deployment failed:', error);
    res.status(500).send('Deployment failed');
  }
});

/**
 * Updates a Managed Instance Group to use a specific Instance Template.
 * Supports both Zonal and Regional MIGs via env vars MIG_LOCATION_TYPE and MIG_LOCATION_VALUE.
 * @param {string} migName - The name of the Managed Instance Group.
 * @param {string} templateName - The name of the new Instance Template.
 */
async function updateManagedInstanceGroup(migName, templateName) {
  try {
    console.log(`Starting rolling update for MIG ${migName} to use template ${templateName}...`);

    if (!PROJECT_ID) {
        console.warn('Skipping MIG update: GOOGLE_CLOUD_PROJECT not set.');
        return;
    }

    const migLocationType = process.env.MIG_LOCATION_TYPE || 'zone'; // 'zone' or 'region'
    // Default to 'us-central1-a' if zone, or 'us-central1' if region (derived from REGION env)
    const migLocationValue = process.env.MIG_LOCATION_VALUE || (migLocationType === 'zone' ? `${REGION}-a` : REGION);

    const instanceTemplateUrl = `projects/${PROJECT_ID}/global/instanceTemplates/${templateName}`;
    let operation;

    if (migLocationType === 'region') {
         console.log(`Updating Regional MIG ${migName} in ${migLocationValue}...`);
         const request = {
            project: PROJECT_ID,
            region: migLocationValue,
            instanceGroupManager: migName,
            instanceGroupManagerResource: {
                versions: [{
                    instanceTemplate: instanceTemplateUrl
                }]
            }
         };
         [operation] = await regionalMigClient.patch(request);
    } else {
         console.log(`Updating Zonal MIG ${migName} in ${migLocationValue}...`);
         const request = {
            project: PROJECT_ID,
            zone: migLocationValue,
            instanceGroupManager: migName,
            instanceGroupManagerResource: {
                versions: [{
                    instanceTemplate: instanceTemplateUrl
                }]
            }
         };
         [operation] = await zonalMigClient.patch(request);
    }

    console.log(`Initiated rolling update for ${migName}. Operation: ${operation.name}`);
  } catch (err) {
    console.error(`Failed to update MIG ${migName}:`, err);
    throw err;
  }
}

/**
 * Updates a Cloud Run service with a new image tag.
 * @param {string} serviceName - The name of the Cloud Run service.
 * @param {string} imageName - The image name (e.g., 'axim-core-backend').
 * @param {string} imageTag - The new tag to deploy.
 */
async function updateCloudRunService(serviceName, imageName, imageTag) {
  try {
    console.log(`Updating Cloud Run Service ${serviceName} to image tag ${imageTag}...`);

    if (!PROJECT_ID) {
        console.warn('Skipping Cloud Run update: GOOGLE_CLOUD_PROJECT not set.');
        return;
    }

    const servicePath = runClient.servicePath(PROJECT_ID, REGION, serviceName);
    let service;

    try {
        [service] = await runClient.getService({ name: servicePath });
    } catch (err) {
        console.warn(`Service ${serviceName} not found or accessible. Skipping update.`, err);
        return;
    }

    const newImage = `gcr.io/${PROJECT_ID}/${imageName}:${imageTag}`;

    // Cloud Run v2 API structure: service.template.containers
    let containers = service.template.containers;
    if (!containers && service.template.spec && service.template.spec.containers) {
        // Fallback for v1 structure
        containers = service.template.spec.containers;
    }

    if (!containers || containers.length === 0) {
        throw new Error(`No containers found in service definition for ${serviceName}`);
    }

    // Check if update is needed
    const currentImage = containers[0].image;
    if (currentImage === newImage) {
        console.log(`Service ${serviceName} is already running ${newImage}. Skipping.`);
        return;
    }

    // Update the image
    containers[0].image = newImage;

    // Create request
    const request = {
      service: service,
    };

    const [operation] = await runClient.updateService(request);

    console.log(`Initiated update for Cloud Run Service ${serviceName}. Operation: ${operation.name}`);
  } catch (err) {
    console.error(`Failed to update Cloud Run Service ${serviceName}:`, err);
    throw err;
  }
}

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
