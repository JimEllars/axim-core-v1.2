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
        window.location.href = ssoUrl;
      } else {
        navigate('/auth-offline', { replace: true });
      }
    };

    attemptRedirect();
  }, [navigate]);

  return null;
};

export default RedirectToPassport;
