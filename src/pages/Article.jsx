import React, { useState, useEffect } from 'react';
import { fetchPosts } from '../lib/wp-fetch.js';

const Article = ({ postId }) => {
  const [post, setPost] = useState(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const loadArticle = async () => {
      try {
        const posts = await fetchPosts({ include: postId, _embed: 'true' });
        if (posts && posts.length > 0) {
          setPost(posts[0]);
        } else {
          setIsError(true);
        }
      } catch (error) {
        console.error('Failed to load article:', error);
        setIsError(true);
      }
    };

    if (postId) {
      loadArticle();
    }
  }, [postId]);

  if (isError) {
    return <div>Error loading article. Please try again later.</div>;
  }

  if (!post) {
    return <div>Loading...</div>;
  }

  return (
    <article>
      <h1>{post.title?.rendered}</h1>
      {post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0]?.source_url && (
        <img src={post._embedded['wp:featuredmedia'][0].source_url} alt="Featured" />
      )}
      <div dangerouslySetInnerHTML={{ __html: post.content?.rendered }} />
    </article>
  );
};

export default Article;
