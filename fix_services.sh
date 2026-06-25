#!/bin/bash
find src/services -type f -name "*.js" -exec sed -i 's/from '"'"'@\/services\/logging'"'"'/from '"'"'.\/logging'"'"'/g' {} +
