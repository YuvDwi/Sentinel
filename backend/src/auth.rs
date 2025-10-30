use axum::{
    async_trait,
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use time::{Duration, OffsetDateTime};
use tracing::{debug, error};

/// JWT Claims structure
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,        // username
    pub role: String,       // user role
    pub exp: i64,           // expiry timestamp
    pub iat: i64,           // issued at timestamp
}

impl Claims {
    pub fn new(username: String, role: String, expires_in_hours: i64) -> Self {
        let now = OffsetDateTime::now_utc();
        let exp = now + Duration::hours(expires_in_hours);
        
        Self {
            sub: username,
            role,
            iat: now.unix_timestamp(),
            exp: exp.unix_timestamp(),
        }
    }
}

/// JWT configuration
#[derive(Clone)]
pub struct JwtConfig {
    pub secret: String,
    pub expires_in_hours: i64,
}

impl JwtConfig {
    pub fn new(secret: String) -> Self {
        Self {
            secret,
            expires_in_hours: 24, // 24 hour tokens
        }
    }

    /// Generate a JWT token for a user
    pub fn generate_token(&self, username: String, role: String) -> Result<String, jsonwebtoken::errors::Error> {
        let claims = Claims::new(username, role, self.expires_in_hours);
        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.secret.as_bytes()),
        )
    }

    /// Validate and decode a JWT token
    pub fn validate_token(&self, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.secret.as_bytes()),
            &Validation::default(),
        )?;
        Ok(token_data.claims)
    }
}

/// Authenticated user extractor for protected routes
pub struct AuthUser {
    pub username: String,
    pub role: String,
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
    Arc<JwtConfig>: FromRequestParts<S>,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        // Extract JWT config from state
        let jwt_config = match Arc::<JwtConfig>::from_request_parts(parts, state).await {
            Ok(config) => config,
            Err(_) => {
                error!("Failed to extract JWT config from state");
                return Err((StatusCode::INTERNAL_SERVER_ERROR, "Auth configuration error").into_response());
            }
        };

        // Get Authorization header
        let auth_header = parts
            .headers
            .get("Authorization")
            .and_then(|h| h.to_str().ok())
            .ok_or_else(|| {
                debug!("Missing Authorization header");
                (StatusCode::UNAUTHORIZED, "Missing authorization token").into_response()
            })?;

        // Extract Bearer token
        let token = auth_header
            .strip_prefix("Bearer ")
            .ok_or_else(|| {
                debug!("Invalid Authorization header format");
                (StatusCode::UNAUTHORIZED, "Invalid authorization format").into_response()
            })?;

        // Validate token
        let claims = jwt_config.validate_token(token).map_err(|e| {
            error!("Token validation failed: {}", e);
            (StatusCode::UNAUTHORIZED, "Invalid or expired token").into_response()
        })?;

        debug!("Authenticated user: {} (role: {})", claims.sub, claims.role);

        Ok(AuthUser {
            username: claims.sub,
            role: claims.role,
        })
    }
}

/// Login request structure
#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

/// Signup request structure
#[derive(Debug, Deserialize)]
pub struct SignupRequest {
    pub username: String,
    pub password: String,
    pub email: String,
    pub role: Option<String>, // Optional, defaults to "viewer"
}

/// Login response structure
#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub username: String,
    pub role: String,
    pub expires_in: i64,
}

/// Error response
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

