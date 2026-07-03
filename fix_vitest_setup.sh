#!/bin/bash
sed -i 's/AnimatePresence: ({ children }) => <>{children}<\/>,/AnimatePresence: ({ children }) => children,/g' vitest.setup.jsx
