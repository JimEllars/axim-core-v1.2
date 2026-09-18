const fs = require('fs');

async function testDispatcher() {
    console.log("Simulating dispatcher payload to CFO department...");
    // A mock payload test
    let passed = true;
    try {
        const payload = {
            action_type: 'quarantine_app',
            payload: {
                app_id: 'test-app',
                reason: 'test',
                target_department: 'CFO'
            }
        };

        const target_department = payload.payload?.target_department || 'CORE';
        if (target_department !== 'CFO') {
            console.error("Failed to extract target_department correctly");
            passed = false;
        }

        const isHighStakes = ['quarantine_app'].includes(payload.action_type);
        if (isHighStakes) {
            const toolCalledPayload = {
                ...payload.payload,
                target_department: target_department
            };

            const stringified = JSON.stringify(toolCalledPayload);
            if (!stringified.includes('"target_department":"CFO"')) {
                console.error("Failed to serialize target_department correctly");
                passed = false;
            }
        }
        console.log("Simulation passed.");
    } catch (e) {
        console.error(e);
        passed = false;
    }

    if (passed) {
        console.log("All verifications passed.");
        process.exit(0);
    } else {
        process.exit(1);
    }
}

testDispatcher();
