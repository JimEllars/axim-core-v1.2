#!/bin/bash
# Finalized for Production Deployment
#
# Production startup script for a GCE instance running the AXiM Core Backend.
# This script assumes the instance is running a Container-Optimized OS and
# that the CI/CD pipeline has already pushed the application's Docker image
# to the Google Container Registry (GCR).
#

# --- Generic Setup ---
set -e
echo "Starting AXiM Core Backend container startup script..."

# --- Configure Application ---
# The GCE instance template should pass the necessary environment variables
# to the container at runtime. This includes the GCP_DB_CREDENTIALS_SECRET_NAME,
# DB_HOST, DB_NAME, REDIS_URL, etc.
#
# This script will retrieve the Docker image tag from the GCE instance metadata.
# The CI/CD pipeline is responsible for setting this metadata value during the
# rolling update of the Managed Instance Group.
IMAGE_TAG=$(curl "http://metadata.google.internal/computeMetadata/v1/instance/attributes/IMAGE_TAG" -H "Metadata-Flavor: Google")
PROJECT_ID=$(curl "http://metadata.google.internal/computeMetadata/v1/project/project-id" -H "Metadata-Flavor: Google")

if [ -z "$IMAGE_TAG" ]; then
  echo "Warning: IMAGE_TAG metadata not found. Defaulting to 'latest'."
  IMAGE_TAG="latest"
fi

# Define the full image path
DOCKER_IMAGE="gcr.io/${PROJECT_ID}/axim-core-backend:${IMAGE_TAG}"

# --- Start Application Container ---
# Pull the specified Docker image from GCR
echo "Pulling image: ${DOCKER_IMAGE}"
docker pull "${DOCKER_IMAGE}"

# Stop and remove any existing container with the same name
docker stop axim-core-backend || true
docker rm axim-core-backend || true

# Run the new container.
# Environment variables for the application (e.g., database credentials)
# must be passed into the container from the instance metadata.
docker run -d --name axim-core-backend \
  -p 8080:8080 \
  --restart=always \
  -e PORT=8080 \
  -e GCP_DB_CREDENTIALS_SECRET_NAME=$(curl "http://metadata.google.internal/computeMetadata/v1/instance/attributes/GCP_DB_CREDENTIALS_SECRET_NAME" -H "Metadata-Flavor: Google") \
  -e DB_HOST=$(curl "http://metadata.google.internal/computeMetadata/v1/instance/attributes/DB_HOST" -H "Metadata-Flavor: Google") \
  -e DB_NAME=$(curl "http://metadata.google.internal/computeMetadata/v1/instance/attributes/DB_NAME" -H "Metadata-Flavor: Google") \
  -e REDIS_URL=$(curl "http://metadata.google.internal/computeMetadata/v1/instance/attributes/REDIS_URL" -H "Metadata-Flavor: Google") \
  "${DOCKER_IMAGE}"

echo "AXiM Core Backend container started successfully."
