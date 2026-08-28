import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { checkSsoHealth } from '../lib/auth-handoff';

import toast from 'react-hot-toast';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, role, loading } = useAuth();
  const navigate = useNavigate();
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    const ssoUrl = "https://passport.axim.us.com";

    const attemptRedirect = async () => {
      setIsRedirecting(true);
      const isHealthy = await checkSsoHealth(ssoUrl);
      if (isHealthy) {
        window.location.href = ssoUrl;
      } else {
        navigate('/auth-offline', { replace: true });
      }
    };

    if (!loading && !isAuthenticated) {
      attemptRedirect();
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading || (!isAuthenticated && isRedirecting)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    setTimeout(() => toast.error('Access Denied'), 0);
    return <Navigate to="/dashboard" />;
  }

  return children;
};

export default ProtectedRoute;
