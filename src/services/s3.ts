// import {
//   S3Client,
//   PutObjectCommand,
//   GetObjectCommand,
//   type PutObjectCommandInput,
// } from '@aws-sdk/client-s3'
// import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// export interface S3Config {
//   region: string
//   bucket: string
//   accessKeyId: string
//   secretAccessKey: string
//   endpoint?: string
//   forcePathStyle?: boolean
// }

// export interface UploadOptions {
//   keyPrefix?: string
//   /** Time-to-live in seconds. The uploaded document will be considered expired after this duration. */
//   ttl?: number
//   acl?: PutObjectCommandInput['ACL']
//   onProgress?: (loaded: number, total: number) => void
// }

// export interface UploadResult {
//   key: string
//   bucket: string
//   region: string
//   /** Public S3 object URL (permanent, may be behind bucket policy). */
//   location: string
//   etag?: string
//   /** ISO-8601 timestamp of when the object expires. */
//   expiresAt: string
//   /** TTL in seconds that was applied. */
//   ttl: number
//   /** Presigned download URL that expires at the same TTL. */
//   presignedUrl: string
// }

// let cachedClient: S3Client | null = null
// let cachedConfig: S3Config | null = null

// export function getS3Client(): S3Client | null {
//   if (!cachedConfig) return null
//   if (!cachedClient) {
//     cachedClient = new S3Client({
//       region: cachedConfig.region,
//       credentials: {
//         accessKeyId: cachedConfig.accessKeyId,
//         secretAccessKey: cachedConfig.secretAccessKey,
//       },
//       ...(cachedConfig.endpoint
//         ? {
//             endpoint: cachedConfig.endpoint,
//             forcePathStyle: cachedConfig.forcePathStyle ?? true,
//           }
//         : {}),
//     })
//   }
//   return cachedClient
// }

// export function configureS3(config: S3Config): void {
//   cachedConfig = config
//   cachedClient = null
// }

// export function configureS3FromEnv(): void {
//   const region = import.meta.env.VITE_AWS_REGION
//   const bucket = import.meta.env.VITE_AWS_BUCKET
//   const accessKeyId = import.meta.env.VITE_AWS_ACCESS_KEY_ID
//   const secretAccessKey = import.meta.env.VITE_AWS_SECRET_ACCESS_KEY
//   const endpoint = import.meta.env.VITE_AWS_ENDPOINT

//   if (!region || !bucket || !accessKeyId || !secretAccessKey) {
//     throw new Error(
//       'Missing required VITE_AWS_REGION, VITE_AWS_BUCKET, VITE_AWS_ACCESS_KEY_ID, or VITE_AWS_SECRET_ACCESS_KEY',
//     )
//   }

//   configureS3({
//     region,
//     bucket,
//     accessKeyId,
//     secretAccessKey,
//     endpoint: endpoint || undefined,
//   })
// }

// export function generateKey(fileName: string, keyPrefix?: string): string {
//   const timestamp = Date.now()
//   const random = Math.random().toString(36).slice(2, 8)
//   const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
//   const prefix = keyPrefix ? `${keyPrefix.replace(/\/$/, '')}/` : ''
//   return `${prefix}${timestamp}-${random}-${safeName}`
// }

// export function computeExpiresAt(ttl: number): Date {
//   return new Date(Date.now() + ttl * 1000)
// }

// export async function getPresignedDownloadUrl(
//   key: string,
//   ttl: number,
// ): Promise<string> {
//   const config = cachedConfig
//   if (!config) {
//     throw new Error('S3 not configured. Call configureS3() or configureS3FromEnv() first.')
//   }
//   const client = getS3Client()
//   if (!client) {
//     throw new Error('Failed to create S3 client.')
//   }

//   const command = new GetObjectCommand({
//     Bucket: config.bucket,
//     Key: key,
//   })

//   return getSignedUrl(client, command, { expiresIn: ttl })
// }

// export async function uploadToS3(
//   file: File,
//   options: UploadOptions = {},
// ): Promise<UploadResult> {
//   const config = cachedConfig
//   if (!config) {
//     throw new Error('S3 not configured. Call configureS3() or configureS3FromEnv() first.')
//   }

//   const client = getS3Client()
//   if (!client) {
//     throw new Error('Failed to create S3 client.')
//   }

//   const key = generateKey(file.name, options.keyPrefix)
//   const ttl = options.ttl ?? 3600 // default 1 hour
//   const expiresAt = computeExpiresAt(ttl)

//   // Convert File to Uint8Array to avoid readableStream.getReader issues
//   // with the AWS SDK in some browser environments.
//   const body = new Uint8Array(await file.arrayBuffer())

//   const params: PutObjectCommandInput = {
//     Bucket: config.bucket,
//     Key: key,
//     Body: body,
//     ContentType: file.type || 'application/octet-stream',
//     Expires: expiresAt,
//     Metadata: {
//       'ttl': String(ttl),
//       'expires-at': expiresAt.toISOString(),
//     },
//   }

//   if (options.acl) {
//     params.ACL = options.acl
//   }

//   const command = new PutObjectCommand(params)

//   if (options.onProgress) {
//     let lastLoaded = 0
//     command.middlewareStack.add(
//       (next) => async (args) => {
//         const result = await next(args)
//         lastLoaded += file.size
//         options.onProgress?.(lastLoaded, file.size)
//         return result
//       },
//       { step: 'build', name: 'uploadProgress' },
//     )
//   }

//   const response = await client.send(command)
//   const presignedUrl = await getPresignedDownloadUrl(key, ttl)

//   return {
//     key,
//     bucket: config.bucket,
//     region: config.region,
//     location: config.endpoint
//       ? `${config.endpoint}/${config.bucket}/${key}`
//       : `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`,
//     etag: response.ETag,
//     expiresAt: expiresAt.toISOString(),
//     ttl,
//     presignedUrl,
//   }
// }

// export async function uploadMultipleToS3(
//   files: File[],
//   options: UploadOptions = {},
// ): Promise<{ uploaded: UploadResult[]; errors: { fileName: string; error: string }[] }> {
//   const results = await Promise.allSettled(
//     files.map(file => uploadToS3(file, options)),
//   )

//   const uploaded: UploadResult[] = []
//   const errors: { fileName: string; error: string }[] = []

//   results.forEach((result, index) => {
//     if (result.status === 'fulfilled') {
//       uploaded.push(result.value)
//     } else {
//       errors.push({
//         fileName: files[index].name,
//         error: result.reason instanceof Error ? result.reason.message : String(result.reason),
//       })
//     }
//   })

//   if (errors.length > 0) {
//     console.error('S3 upload errors:', errors)
//   }

//   return { uploaded, errors }
// }
