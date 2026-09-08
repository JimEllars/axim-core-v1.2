import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkSsoHealth } from '../lib/auth-handoff';

const RedirectToPassport = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const ssoUrl = "https://passport.axim.us.com";

    const attemptRedirect = async () => {
      const isHealthy = await checkSsoHealth(ssoUrl);
      if (isHealthy) {
        window.location.href = "https://passport.axim.us.com/login?redirect_uri=https://core.axim.us.com/auth/callback&app_id=core";
      } else {
        navigate('/auth-offline', { replace: true });
      }
    };

    attemptRedirect();
  }, [navigate]);

  return null;
};

export default RedirectToPassport;
