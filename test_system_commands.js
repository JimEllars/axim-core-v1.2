import fs from 'fs';
const content = fs.readFileSync('src/services/onyxAI/commands/systemCommands.js', 'utf8');

if (content.includes("name: 'monitorBillingAnomalies'")) {
  console.log("monitorBillingAnomalies found");
} else {
  console.log("missing monitorBillingAnomalies");
}

if (content.includes("execute(args, { aximCore })")) {
  console.log("execute signature OK");
}
