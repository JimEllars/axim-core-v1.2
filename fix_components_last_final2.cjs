const fs = require('fs');

let content = fs.readFileSync('src/components/dashboard/ApiUsageChart.jsx', 'utf8');

content = content.replace(/const ChartSkeleton = \(\) => \(/g, '');
content = content.replace(/<div className="h-64 flex flex-col items-center justify-center space-y-4">/g, '');
content = content.replace(/<div className="animate-pulse flex space-x-4 items-end h-full w-full px-8 pb-4">/g, '');
content = content.replace(/\{\[40, 70, 45, 90, 65, 80, 50\].map\(\(height, i\) => \(/g, '');
content = content.replace(/<div key=\{i\} className="w-full bg-onyx-950\/50 rounded-t" style=\{\{ height: `\$\{height\}%` \}\}>\S*?<\/div>/g, '');
content = content.replace(/<div key=\{i\} className="w-full bg-onyx-950\/50 rounded-t" style=\{\{ height: `\$\{height\}%` \}\}><\/div>/g, '');
content = content.replace(/\)\)}/g, '');
content = content.replace(/<\/div>/g, '');
content = content.replace(/<\/div>/g, '');
content = content.replace(/\);/g, '');

const chartSkeleton = `const ChartSkeleton = () => (
    <div className="h-64 flex flex-col items-center justify-center space-y-4">
       <div className="animate-pulse flex space-x-4 items-end h-full w-full px-8 pb-4">
         {[40, 70, 45, 90, 65, 80, 50].map((height, i) => (
           <div key={i} className="w-full bg-onyx-950/50 rounded-t" style={{ height: \`\${height}%\` }}></div>
         ))}
       </div>
    </div>
  );`;

const pieSkeleton = `const PieSkeleton = () => (
    <div className="h-64 flex items-center justify-center">
        <div className="animate-pulse w-48 h-48 bg-onyx-950 rounded-full border-8 border-slate-800"></div>
    </div>
  );`;

// Just to be safe let's checkout original file
