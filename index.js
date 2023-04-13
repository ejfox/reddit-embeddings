const axios = require('axios');
const { Configuration, OpenAIApi } = require("openai");
const fs = require('fs');
const dotenv = require("dotenv");

dotenv.config();

const configuration = new Configuration({
  apiKey: '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'
});
const openai = new OpenAIApi(configuration);

const fetchTopPosts = async (after) => {
  console.log(`Fetching posts after ${after}`);
  const fetchUrl = `https://www.reddit.com/r/dataisbeautiful/top.json?t=year&limit=100&after=${after}`
  console.log('🔗 Fetching URL:', fetchUrl);
  const response = await axios.get(fetchUrl);
  return response.data.data.children;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const downloadImage = async (url, filename) => {
  const response = await axios({
    url,
    responseType: 'stream'
  });

  // Create a writable stream with the filename
  const fileStream = fs.createWriteStream(filename);

  // Pipe the response data into the fileStream
  response.data.pipe(fileStream);

  console.log(`Downloading image ${filename}`);

  return new Promise((resolve, reject) => {
    fileStream.on('finish', () => {
      console.log(`Finished downloading image ${filename}`);
      resolve();
    });

    fileStream.on('error', () => {
      console.log(`Error downloading image ${filename}`);
      reject()
    });
  });
};

const processPost = async (post) => {
  const { data } = post;
  const {
    title,
    score,
    gilded,
    author,
    link_flair_text,
    id,
    url,
    num_comments,
    created_utc
  } = data;

  console.log(`Processing post ${id}`);

  if (url.match(/\.(jpeg|jpg|gif|png)$/) != null) {
    const filename = `./images/${id}.png`;
    if (!fs.existsSync(filename)) {
      await downloadImage(url, filename);
    }
  }

  return {
    title,
    score,
    gilded,
    author,
    link_flair_text,
    id,
    url,
    num_comments,
    created_utc
  };
};

const getEmbeddings = async (posts) => {
  console.log('Getting embeddings');
  const embeddings = await Promise.all(posts.map(async (post) => {
    const postId = post.id;
    const embeddingFilename = `./embeddings/${postId}.json`;

    if (fs.existsSync(embeddingFilename)) {
      console.log(`Loading embedding from file ${embeddingFilename}`);
      const embeddingData = fs.readFileSync(embeddingFilename, 'utf-8');
      return JSON.parse(embeddingData);
    }

    console.log(`Getting embedding for post ${postId}`);
    const openAIResponse = await openai.createEmbedding({
      model: 'text-embedding-ada-002',
      input: JSON.stringify(post),
    });

    const embedding = {
      ...openAIResponse.data,
      id: postId
    };

    // Save the embedding to a file
    fs.writeFileSync(embeddingFilename, JSON.stringify(embedding));

    return embedding;
  }));

  return embeddings;
};

(async () => {
  let allPosts = [];
  let after = null;
  const maxPosts = 1000;

  while (allPosts.length < maxPosts) {
    const posts = await fetchTopPosts(after);
    if (!posts.length) break;
    allPosts = allPosts.concat(posts);
    after = posts[posts.length - 1].data.id;
    await delay(3000); // Wait 3 seconds between Reddit API requests
  }

  const processedPosts = await Promise.all(allPosts.map(processPost));
  const embeddings = await getEmbeddings(processedPosts);
  console.log(embeddings);

  const embeddingMap = {};
  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i];
    const { id } = embedding;
    embeddingMap[id] = embedding;
  }

  const embeddingCount = Object.keys(embeddingMap).length;
  console.log(`Total number of embeddings: ${embeddingCount}`);

  const imageCount = fs.readdirSync('./images').length;
  console.log(`Total number of images: ${imageCount}`);

  fs.writeFileSync('./embeddingMap.json', JSON.stringify(embeddingMap));

  for (let i = 0; i < embeddings.length; i++) {
    fs.writeFileSync(`./embeddings/${embeddings[i].id}.json`, JSON.stringify(embeddings[i]));
  }
  console.log('Finished');
})();