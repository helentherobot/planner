import { Runner } from '@helentherobot/runner'
import type { RunnerConfig } from '@helentherobot/runner'
import type { PhaseState, ControlState } from '@/index.ts'

const runnerConfig: RunnerConfig = {
  profiles: {
    flash: {
      provider: 'google',
      model: 'gemini-2.5-flash',
      contextWindowTokens: 200_000,
      requestTimeoutMs: 120_000,
      providerOptions: {
        google: { thinkingConfig: { thinkingBudget: 0 } },
      },
      queue: {
        maxConcurrent: 5,
        requestsPerMinute: 20,
        affinityMode: false,
        warmup: false,
      },
    },
    '4o-mini': {
      provider: 'openai',
      model: 'gpt-4o-mini',
      contextWindowTokens: 128_000,
      requestTimeoutMs: 120_000,
      queue: {
        maxConcurrent: 5,
        requestsPerMinute: 60,
        affinityMode: false,
        warmup: false,
      },
    },
  },
  secrets: { google: process.env.GOOGLE_API_KEY, openAi: process.env.OPENAI_API_KEY },
}

export const runner = new Runner(runnerConfig)
export const profileNames = Object.keys(runnerConfig.profiles)
export const defaultProfile = process.env.HELEN_PROFILE || profileNames[0]

export const prompts = {
  tiny: `Add a new field, called dayOfWeek, to the PhaseState that gets written to during the cleanup task.`,
}

export interface ControlFixture {
  name: string
  phase?: Partial<PhaseState>
  control?: Partial<ControlState>
  expected: string
}

export const fixtures: Record<string, ControlFixture[]> = {
  vagueness: [
    {
      name: 'flags-vague-steps',
      phase: {
        title: 'API rate limiting',
        brief: `Implement rate limiting for the API.

Steps:
- Set up rate limiting middleware
- Configure the limits appropriately
- Handle errors in a reasonable way
- Make sure it works with the existing auth`,
      },
      expected: 'findings: [{ path, reason }] with at least one vague step',
    },
    {
      name: 'does-not-reflag-dismissed',
      phase: {
        title: 'API rate limiting',
        brief: `Implement rate limiting for the API.

Steps:
- Create \`src/middleware/rateLimiter.ts\` using \`express-rate-limit\`, configured for 100 req/min per IP with a \`429\` status and \`Retry-After\` header
- Apply it in \`src/app.ts\` with \`app.use('/api', rateLimiter)\` before all route handlers
- Write unit tests in \`tests/middleware/rateLimiter.test.ts\` covering the 429 response and header
- Configure \`RATE_LIMIT_MAX\` and \`RATE_LIMIT_WINDOW_MS\` per the deployment runbook`,
      },
      control: {
        dismissed: [
          {
            path: 'Configure `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` per the deployment runbook',
            reason:
              'false positive — the runbook specifies exact values; this step is sufficiently specific',
          },
        ],
      },
      expected: '{ "findings": [] }',
    },
    {
      name: 'all-clear',
      phase: {
        title: 'API rate limiting',
        brief: `Implement rate limiting for the API.

Steps:
- Add \`express-rate-limit\` middleware to \`src/middleware/rateLimiter.ts\`
- Configure 100 requests/minute per IP via \`RATE_LIMIT_MAX\` and \`RATE_LIMIT_WINDOW_MS\` env vars
- Return 429 with a \`Retry-After\` header when the limit is exceeded
- Write unit tests in \`tests/middleware/rateLimiter.test.ts\` covering: requests within limit return 200, requests exceeding limit return 429 with \`Retry-After\` header, window resets after \`RATE_LIMIT_WINDOW_MS\``,
      },
      expected: '{ "findings": [] }',
    },
  ],

  duplication: [
    {
      name: 'flags-duplication',
      phase: {
        title: 'User profile page',
        brief: `Build the user profile page.

Files:
- \`src/components/Profile.tsx\` — profile UI component
- \`src/routes/profile.ts\` — GET /me endpoint returning the current user's profile
- \`src/middleware/auth.ts\` — implement JWT verification middleware for all protected routes
- \`src/hooks/useProfile.ts\` — React hook for fetching profile data`,
      },
      expected: 'findings: [{ path, reason }] with at least one flagged item',
    },
    {
      name: 'does-not-reflag-dismissed',
      phase: {
        title: 'User profile page',
        brief: `Build the user profile page.

Files:
- \`src/components/Profile.tsx\` — profile UI component
- \`src/routes/profile.ts\` — GET /me endpoint returning the current user's profile
- \`src/middleware/auth.ts\` — add profile:read permission check to existing auth middleware
- \`src/hooks/useProfile.ts\` — React hook for fetching profile data`,
      },
      control: {
        dismissed: [
          {
            path: 'src/middleware/auth.ts',
            reason:
              'false positive — adding a single permission check to an existing middleware is feature-specific, not cross-cutting infrastructure',
          },
        ],
      },
      expected: '{ "findings": [] }',
    },
    {
      name: 'all-clear',
      phase: {
        title: 'User profile page',
        brief: `Build the user profile page. Authentication middleware is implemented and imported from the existing auth module.

Files:
- \`src/components/Profile.tsx\` — profile UI component
- \`src/routes/profile.ts\` — GET /me endpoint, protected by existing auth middleware
- \`src/hooks/useProfile.ts\` — React hook for fetching profile data
- \`src/components/EditableDisplayName.tsx\` — inline display name editor, profile page only`,
      },
      expected: '{ "findings": [] }',
    },
  ],

  scope: [
    {
      name: 'flags-out-of-scope-files',
      phase: {
        title: 'Add user avatar upload',
        brief: `Implement avatar upload for user profiles.

Files:
- \`src/routes/upload.ts\` — new upload endpoint
- \`src/services/storage.ts\` — S3 integration
- \`src/models/user.ts\` — add avatarUrl field
- \`src/middleware/auth.ts\` — refactor token validation logic
- \`src/components/AvatarPicker.tsx\` — upload UI
- \`migrations/004_user_avatar.sql\` — add avatarUrl column`,
        index: `src/routes/upload.ts
src/services/storage.ts
src/models/user.ts
src/components/AvatarPicker.tsx
migrations/004_user_avatar.sql`,
      },
      expected: 'findings: [{ path, reason }] with at least one flagged item',
    },
    {
      name: 'does-not-reflag-dismissed',
      phase: {
        title: 'Add user avatar upload',
        brief: `Implement avatar upload for user profiles.

Files:
- \`src/routes/upload.ts\` — new upload endpoint
- \`src/services/storage.ts\` — S3 integration
- \`src/models/user.ts\` — add avatarUrl field
- \`src/middleware/auth.ts\` — add avatar scope check
- \`src/components/AvatarPicker.tsx\` — upload UI
- \`migrations/004_user_avatar.sql\` — add avatarUrl column`,
        index: `src/routes/upload.ts
src/services/storage.ts
src/models/user.ts
src/middleware/auth.ts
src/components/AvatarPicker.tsx
migrations/004_user_avatar.sql`,
      },
      control: {
        dismissed: [
          {
            path: 'src/middleware/auth.ts',
            reason:
              'false positive — the auth.ts change is a minor permission addition directly required by the upload feature',
          },
        ],
      },
      expected: '{ "findings": [] }',
    },
    {
      name: 'all-clear',
      phase: {
        title: 'Add user avatar upload',
        brief: `Implement avatar upload for user profiles.

Files:
- \`src/routes/upload.ts\` — new upload endpoint
- \`src/services/storage.ts\` — S3 integration
- \`src/models/user.ts\` — add avatarUrl field
- \`src/components/AvatarPicker.tsx\` — upload UI
- \`migrations/004_user_avatar.sql\` — add avatarUrl column`,
        index: `src/routes/upload.ts
src/services/storage.ts
src/models/user.ts
src/components/AvatarPicker.tsx
migrations/004_user_avatar.sql`,
      },
      expected: '{ "findings": [] }',
    },
  ],
}
