#!/bin/bash
sed -i 's/job.status = '"'"'failed'"'"';/job.status = '"'"'failed'"'"';/g' tests/e2e-workflow.test.js
