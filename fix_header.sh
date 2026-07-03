#!/bin/bash
sed -i "s/import { useAuth } from '..\/..\/contexts\/AuthContext';/import { useAuth } from '..\/..\/contexts\/AuthContext';\nimport { BrowserRouter } from 'react-router-dom';/" src/components/dashboard/Header.test.jsx
sed -i "s/render(<Header \/>);/render(<BrowserRouter><Header \/><\/BrowserRouter>);/g" src/components/dashboard/Header.test.jsx
