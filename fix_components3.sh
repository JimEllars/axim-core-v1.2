sed -i 's/const ChartSkeleton = () => (/const ChartSkeleton = function() { return (/g' src/components/dashboard/ApiUsageChart.jsx
sed -i 's/const PieSkeleton = () => (/const PieSkeleton = function() { return (/g' src/components/dashboard/ApiUsageChart.jsx
