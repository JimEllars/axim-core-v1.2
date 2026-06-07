sed -i 's/uses: actions\/checkout@v4/uses: actions\/checkout@v4/g' .github/workflows/*.yml
# wait, actually the warning is about Node 20. But they are using v4... The warning says "Actions will be forced to run with Node.js 24 by default... To opt into Node.js 24 now, set the FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true environment variable on the runner or in your workflow file."
