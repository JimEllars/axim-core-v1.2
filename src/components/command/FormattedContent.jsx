import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { FiCheckCircle, FiXCircle, FiTool } from 'react-icons/fi';
import atomOneDark from 'react-syntax-highlighter/dist/esm/styles/prism/atom-dark';

const renderAsTable = (data) => {
  if (!data || data.length === 0) {
    return <p>No data to display.</p>;
  }
    const headers = Object.keys(data[0]);
    return (
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-700">
                <thead className="bg-onyx-950">
                    <tr>
                        {headers.map(header => (
                            <th key={header} scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="bg-onyx-950 divide-y divide-slate-800">
                    {data.map((row, i) => (
                        <tr key={i}>
                            {headers.map(header => (
                                <td key={`${i}-${header}`} className="px-6 py-4 whitespace-nowrap text-sm text-slate-200">
                                    {typeof row[header] === 'object' ? JSON.stringify(row[header]) : row[header]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};


const renderTextWithTools = (text) => {
    const toolRegex = /\[Tool Executed:\s*([^-]+?)\s*-\s*(Success|Failed|Error|[^\]]+)\]/gi;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = toolRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
        }

        const toolName = match[1].trim();
        const status = match[2].trim();
        const isSuccess = status.toLowerCase() === 'success';

        parts.push(
            <div key={`tool-${match.index}`} className="my-3 flex items-center p-3 bg-onyx-950 border border-onyx-accent/20 rounded-md shadow-lg w-fit">
                <div className={`mr-3 flex-shrink-0 p-1.5 rounded-md ${isSuccess ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {isSuccess ? <FiCheckCircle className="w-5 h-5" /> : <FiXCircle className="w-5 h-5" />}
                </div>
                <div>
                    <div className="text-xs text-slate-400 font-mono tracking-wider uppercase mb-1 flex items-center">
                        <FiTool className="mr-1 w-3 h-3" /> System Action
                    </div>
                    <div className="text-sm font-bold text-slate-200">
                        {toolName} <span className={`ml-2 text-xs px-2 py-0.5 rounded ${isSuccess ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>{status}</span>
                    </div>
                </div>
            </div>
        );

        lastIndex = toolRegex.lastIndex;
    }

    if (lastIndex < text.length) {
        parts.push(<span key={`text-${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }

    if (parts.length === 0) return text;
    return <>{parts}</>;
};

const FormattedContent = ({ content }) => {
    let parsedContent = content;

    if (typeof content === 'string' && (content.trim().startsWith('{') || content.trim().startsWith('['))) {
        try {
            parsedContent = JSON.parse(content);
        } catch (e) {
            // Not valid JSON, fall back to rendering as a string
        }
    }

    if (Array.isArray(parsedContent) && parsedContent.length > 0 && typeof parsedContent[0] === 'object' && parsedContent[0] !== null) {
        return renderAsTable(parsedContent);
    }

    if (typeof parsedContent === 'object' && parsedContent !== null) {
        return (
            <SyntaxHighlighter language="json" style={atomOneDark} customStyle={{ maxHeight: '400px', overflowY: 'auto' }}>
                {JSON.stringify(parsedContent, null, 2)}
            </SyntaxHighlighter>
        );
    }

    return <pre className="whitespace-pre-wrap font-mono">{renderTextWithTools(String(content))}</pre>;
};

export default FormattedContent;
