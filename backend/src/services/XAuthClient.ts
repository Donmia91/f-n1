import crypto from 'crypto';

export class XAuthClient {
  private apiKey: string;
  private apiSecret: string;
  private bearerToken: string = '';

  constructor() {
    this.apiKey = process.env.X_API_KEY || '';
    this.apiSecret = process.env.X_API_SECRET || '';
  }

  /**
   * Generate OAuth URL for X authentication
   */
  generateAuthUrl(state: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      client_id: this.apiKey,
      redirect_uri: process.env.X_CALLBACK_URL || 'http://localhost:8787/api/social/oauth/x/callback',
      response_type: 'code',
      scope: 'tweet.read tweet.write tweet.moderate.write users.read follows.read follows.write',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string, codeVerifier: string): Promise<any> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.X_CALLBACK_URL || 'http://localhost:8787/api/social/oauth/x/callback',
      client_id: this.apiKey,
      code_verifier: codeVerifier
    });

    try {
      const response = await fetch('https://twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Team-Workstation/1.0'
        },
        body: params.toString()
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`X OAuth token exchange failed: ${error}`);
      }

      return response.json();
    } catch (error) {
      console.error('X OAuth exchange error:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<any> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.apiKey
    });

    try {
      const response = await fetch('https://twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Team-Workstation/1.0'
        },
        body: params.toString()
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      return response.json();
    } catch (error) {
      console.error('X token refresh error:', error);
      throw error;
    }
  }

  /**
   * Fetch user info from X API
   */
  async getUserInfo(accessToken: string): Promise<any> {
    try {
      const response = await fetch('https://api.twitter.com/2/users/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'Team-Workstation/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.status}`);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('X user info fetch error:', error);
      throw error;
    }
  }

  /**
   * Create a tweet
   */
  async createTweet(accessToken: string, text: string): Promise<any> {
    try {
      const response = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Team-Workstation/1.0'
        },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to create tweet: ${JSON.stringify(error)}`);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      console.error('X tweet creation error:', error);
      throw error;
    }
  }
}

export function generateCodeChallenge(codeVerifier: string): string {
  return crypto.createHash('sha256').update(codeVerifier).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
