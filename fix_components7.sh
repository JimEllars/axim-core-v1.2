sed -i '14s/const ChartSkeleton = () => (/function ChartSkeleton() { return (/g' src/components/dashboard/ApiUsageChart.jsx
sed -i '23s/const PieSkeleton = () => (/function PieSkeleton() { return (/g' src/components/dashboard/ApiUsageChart.jsx
sed -i 's/  );/  ); }/g' src/components/dashboard/ApiUsageChart.jsx
