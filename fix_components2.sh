#!/bin/bash
sed -i 's/import { ConnectivityContext } from '"'"'..\/..\/contexts\/ConnectivityContext'"'"';/import { ConnectivityContext } from '"'"'..\/..\/..\/contexts\/ConnectivityContext'"'"';/g' src/components/common/__tests__/OfflineIndicator.test.jsx
