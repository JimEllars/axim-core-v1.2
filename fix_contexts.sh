#!/bin/bash
find src/contexts -type f -name "*.jsx" -exec sed -i 's/from '"'"'@\/services\/connectivityManager'"'"'/from '"'"'..\/services\/connectivityManager'"'"'/g' {} +
