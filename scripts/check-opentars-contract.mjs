import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const swaggerPath = resolve(
  process.argv[2] ||
    process.env.OPENTARS_SWAGGER_JSON ||
    '../opentars/server/swaggerdocs/swagger.json',
)

const requiredOperations = {
  '/healthz': ['get'],
  '/readyz': ['get'],
  '/v1/auth/login': ['post'],
  '/v1/auth/logout': ['post'],
  '/v1/auth/refresh': ['post'],
  '/v1/auth/register': ['post'],
  '/v1/config': ['get'],
  '/v1/me': ['get'],
  '/v1/meeting-assets/access/{token}': ['get'],
  '/v1/meeting-settings': ['get', 'put'],
  '/v1/meeting-upload-tests': ['post'],
  '/v1/meeting-upload-tests/{test_id}': ['delete'],
  '/v1/meeting-uploads': ['post'],
  '/v1/meeting-uploads/{upload_id}': ['delete', 'get'],
  '/v1/meeting-uploads/{upload_id}/complete': ['post'],
  '/v1/meeting-uploads/{upload_id}/credentials': ['post'],
  '/v1/meetings': ['get', 'post'],
  '/v1/meetings/{meeting_id}': ['delete', 'get'],
  '/v1/meetings/{meeting_id}/assets': ['get'],
  '/v1/meetings/{meeting_id}/assets/{asset_type}': ['get', 'post', 'put'],
  '/v1/meetings/{meeting_id}/audio': ['get'],
  '/v1/meetings/{meeting_id}/share': ['delete', 'get', 'post'],
  '/v1/meetings/{meeting_id}/speaker-aliases': ['put'],
  '/v1/meetings/{meeting_id}/summarize': ['post'],
  '/v1/meetings/{meeting_id}/summary': ['get'],
  '/v1/meetings/{meeting_id}/transcribe': ['post'],
  '/v1/meetings/{meeting_id}/transcript': ['get'],
  '/v1/persona-twin': ['get'],
  '/v1/persona-twin/generate': ['post'],
  '/v1/persona-twin/name': ['patch'],
  '/v1/persona-twin/publish': ['post'],
  '/v1/persona-twin/unpublish': ['post'],
  '/v1/persona-twins/market': ['get'],
  '/v1/public/meeting-shares/{token}': ['get'],
  '/v1/tasks': ['get'],
  '/v1/tasks/{task_id}/cancel': ['post'],
  '/v1/tasks/{task_id}/status': ['get'],
  '/v1/tasks/{task_id}/suggestion-decision': ['post'],
}

const requiredDefinitions = [
  'apimodel.AuthResponse',
  'apimodel.MeResponse',
  'apimodel.TaskListResponse',
  'appconfig.Response',
  'meeting.ListResponse',
  'meeting.Summary',
  'meeting.Transcript',
  'meetings.meetingDetailResponse',
  'meetingshares.PublicDocument',
  'meetinguploads.SDKUploadTargetView',
  'meetinguploads.UploadView',
  'personatwin.MarketPage',
  'personatwin.Twin',
]

const swagger = JSON.parse(await readFile(swaggerPath, 'utf8'))
const missing = []

for (const [path, methods] of Object.entries(requiredOperations)) {
  for (const method of methods) {
    if (!swagger.paths?.[path]?.[method]) missing.push(`${method.toUpperCase()} ${path}`)
  }
}

for (const definition of requiredDefinitions) {
  if (!swagger.definitions?.[definition]) missing.push(`schema ${definition}`)
}

if (missing.length) {
  console.error(`OpenTars contract mismatch in ${swaggerPath}:`)
  missing.forEach((item) => console.error(`- missing ${item}`))
  process.exitCode = 1
} else {
  const operationCount = Object.values(requiredOperations).reduce(
    (total, methods) => total + methods.length,
    0,
  )
  console.log(
    `OpenTars contract OK: ${operationCount} operations and ${requiredDefinitions.length} schemas`,
  )
  console.log(`Source: ${swaggerPath}`)
}
