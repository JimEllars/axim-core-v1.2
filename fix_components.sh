#!/bin/bash
find src/components -type f -name "*.jsx" -exec sed -i 's/from '"'"'..\/..\/..\/contexts\/ConnectivityContext'"'"'/from '"'"'..\/..\/contexts\/ConnectivityContext'"'"'/g' {} +
