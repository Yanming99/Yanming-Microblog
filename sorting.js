// public/js/sorting.js
document.addEventListener('DOMContentLoaded', () => {
    const sortSelect = document.getElementById('sortPosts');
    sortSelect.addEventListener('change', (event) => {
        const selectedOption = event.target.value;
        fetchPosts(selectedOption);
    });

    // Initial fetch with default sorting
    fetchPosts('recency');
});

function fetchPosts(sortBy) {
    fetch(`/posts?sort=${sortBy}`)
        .then(response => response.json())
        .then(posts => {
            const postsContainer = document.getElementById('posts-container');
            postsContainer.innerHTML = '';
            if (posts.length > 0) {
                const ul = document.createElement('ul');
                posts.forEach(post => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <h3>${post.title}</h3>
                        <p>${post.content}</p>
                        <p>Likes: ${post.likes}</p>
                        <p>Posted on: ${new Date(post.createdAt).toLocaleString()}</p>
                    `;
                    ul.appendChild(li);
                });
                postsContainer.appendChild(ul);
            } else {
                postsContainer.innerHTML = '<p>No posts yet.</p>';
            }
        })
        .catch(error => console.error('Error fetching posts:', error));
}
