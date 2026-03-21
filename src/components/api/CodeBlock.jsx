import React from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import darcula from 'react-syntax-highlighter/dist/esm/styles/prism/darcula';

const CodeBlock = ({ code, language }) => {
  return (
    <SyntaxHighlighter language={language} style={darcula} customStyle={{ margin: 0, padding: '1rem', backgroundColor: '#1a202c' }}>
      {code}
    </SyntaxHighlighter>
  );
};

export default CodeBlock;
