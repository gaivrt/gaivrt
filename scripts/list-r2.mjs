import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxy = process.env.https_proxy || process.env.HTTPS_PROXY;
const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  ...(proxy && {
    requestHandler: new NodeHttpHandler({
      httpsAgent: new HttpsProxyAgent(proxy),
    }),
  }),
});

// Fetch and display content of Blog files
for (const prefix of ['Blog/', 'Thoughts/']) {
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET,
      Prefix: prefix,
      MaxKeys: 3,
    }),
  );
  console.log(`\n=== Prefix "${prefix}": ${res.KeyCount} objects ===`);
  for (const obj of res.Contents ?? []) {
    console.log(`\n--- ${obj.Key} ---`);
    const get = await client.send(
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: obj.Key }),
    );
    const body = await get.Body.transformToString('utf-8');
    console.log(body.slice(0, 500));
  }
}
