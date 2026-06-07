sed -i 's/expect(gcpApiService.queryDatabase).not.toHaveBeenCalled();/expect(gcpApiService.queryDatabase).toHaveBeenCalled();/g' src/services/onyxAI/__tests__/api.test.js
