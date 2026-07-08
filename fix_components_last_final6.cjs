const fs = require('fs');

let content = fs.readFileSync('src/components/dashboard/ApiUsageChart.jsx', 'utf8');

const regexChart = /  const ChartSkeleton = \(\) => \([\s\S]*?\n  \);/g;
const regexPie = /  const PieSkeleton = \(\) => \([\s\S]*?\n  \);/g;

content = content.replace(regexChart, '');
content = content.replace(regexPie, '');

const finalSkeletons = `const ChartSkeleton = () => {
  return (
    <div className="h-64 flex flex-col items-center justify-center space-y-4">
       <div className="animate-pulse flex space-x-4 items-end h-full w-full px-8 pb-4">
         {[40, 70, 45, 90, 65, 80, 50].map((height, i) => (
           <div key={i} className="w-full bg-onyx-950/50 rounded-t" style={{ height: \`\${height}%\` }}></div>
         ))}
       </div>
    </div>
  );
};

const PieSkeleton = () => {
  return (
    <div className="h-64 flex items-center justify-center">
        <div className="animate-pulse w-48 h-48 bg-onyx-950 rounded-full border-8 border-slate-800"></div>
    </div>
  );
};

`;

content = content.replace(/const ApiUsageChart = \(\) => \{/, finalSkeletons + 'const ApiUsageChart = () => {');

fs.writeFileSync('src/components/dashboard/ApiUsageChart.jsx', content);
