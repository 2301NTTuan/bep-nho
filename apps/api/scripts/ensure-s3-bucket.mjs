import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

const bucket = process.env.S3_BUCKET;
if (!bucket) throw new Error('S3_BUCKET is required.');

const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log(`Verified S3 bucket ${bucket}`);
} catch {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to create an S3 bucket in production.');
  }
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`Created S3 bucket ${bucket}`);
}
