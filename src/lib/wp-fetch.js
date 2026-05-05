import api from '../services/onyxAI/api.js';

export const fetchPosts = async (params = {}) => {
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    queryParams.append(key, value);
  }

  const payload = { query: queryParams.toString() };

  const response = await api.invokeAximService('wordpress-proxy', '/posts', payload);

  if (!response || !Array.isArray(response)) {
    throw new Error('Invalid response from wordpress-proxy');
  }

  const posts = response;
  const missingMediaIds = [];

  // Identify posts with missing embedded media and collect their featured media IDs
  posts.forEach(post => {
    if (!post._embedded && post.featured_media && post.featured_media > 0) {
      missingMediaIds.push(post.featured_media);
    }
  });

  // If there are missing media IDs, fetch them in a single bulk request
  if (missingMediaIds.length > 0) {
    const uniqueMediaIds = [...new Set(missingMediaIds)].join(',');
    const mediaPayload = { query: `include=${uniqueMediaIds}` };

    try {
      const mediaResponse = await api.invokeAximService('wordpress-proxy', '/media', mediaPayload);

      if (mediaResponse && Array.isArray(mediaResponse)) {
        const mediaMap = mediaResponse.reduce((acc, media) => {
          acc[media.id] = media;
          return acc;
        }, {});

        // Attach the fetched media back to the respective posts
        posts.forEach(post => {
          if (!post._embedded && post.featured_media && mediaMap[post.featured_media]) {
            post._embedded = {
              'wp:featuredmedia': [mediaMap[post.featured_media]]
            };
          }
        });
      }
    } catch (error) {
      console.error('Failed to bulk fetch media:', error);
      // We continue even if media fetch fails, gracefully degrading UI
    }
  }

  return posts;
};
