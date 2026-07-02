const fs = require('fs');

// AuthContext
let file = 'src/contexts/AuthContext.jsx';
let content = fs.readFileSync(file, 'utf8');

// Use `useCallback` on logout and wrap the `useEffect` dependencies properly to satisfy `react-hooks/exhaustive-deps`.
content = content.replace(
  "const logout = async () => {\n    await supabase.auth.signOut();\n  };\n\n  useEffect(() => {\n    const handleUnauthorized = () => {\n      logout();\n    };\n    window.addEventListener('auth:unauthorized', handleUnauthorized);\n    return () => {\n      window.removeEventListener('auth:unauthorized', handleUnauthorized);\n    };\n  }, []);",
  "const logout = useCallback(async () => {\n    await supabase.auth.signOut();\n  }, []);\n\n  useEffect(() => {\n    const handleUnauthorized = () => {\n      logout();\n    };\n    window.addEventListener('auth:unauthorized', handleUnauthorized);\n    return () => {\n      window.removeEventListener('auth:unauthorized', handleUnauthorized);\n    };\n  }, [logout]);"
);

fs.writeFileSync(file, content);

// useApi
file = 'src/hooks/useApi.js';
content = fs.readFileSync(file, 'utf8');
content = content.replace(
  "// eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/use-memo\n  }, dependencies);",
  "// eslint-disable-next-line react-hooks/exhaustive-deps\n  }, dependencies);" // use-memo lint might not be exact. Let's just restore original but disable
);

// We need to restore original useApi
content = content.replace(
  "// eslint-disable-next-line react-hooks/exhaustive-deps\n  }, dependencies);",
  "}, dependencies); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/use-memo"
);

fs.writeFileSync(file, content);
console.log("Final lint fixes.");
