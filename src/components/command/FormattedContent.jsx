import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
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

    return <pre className="whitespace-pre-wrap">{String(content)}</pre>;
};

export default FormattedContent;
