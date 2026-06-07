for file in .github/workflows/*.yml; do
  sed -i 's/env:/env:\n  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true/g' "$file"
done
