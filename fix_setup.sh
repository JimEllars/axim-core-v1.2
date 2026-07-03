#!/bin/bash
sed -i 's/      nav: '"'"'nav'"'"',/      nav: '"'"'nav'"'"',\n      header: '"'"'header'"'"'/g' vitest.setup.jsx
