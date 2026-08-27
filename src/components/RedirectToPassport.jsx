import { useEffect } from 'react';

const RedirectToPassport = () => {
  useEffect(() => {
    window.location.href = "https://passport.axim.us.com";
  }, []);

  return null;
};

export default RedirectToPassport;
