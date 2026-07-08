sed -i 's/const ChartSkeleton = () => (/function ChartSkeleton() { return (/g' src/components/dashboard/ApiUsageChart.jsx
sed -i 's/  );/  ); }/g' src/components/dashboard/ApiUsageChart.jsx
