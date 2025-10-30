#!/bin/bash

# AWS Deployment Script
# Usage: ./deploy.sh [frontend|backend|simulator|all]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
S3_BUCKET="dashboard-frontend-1761705599"
CLOUDFRONT_DIST_ID="E8NV7WXIL5NMZ"
EC2_HOST="ubuntu@3.88.200.41"
EC2_KEY="/Users/yuvie/1password/stateful-dashboard/dashboard-backend-key.pem"
CLOUDFRONT_DOMAIN="d12f8nlgl1hso4.cloudfront.net"

print_header() {
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}========================================${NC}"
}

print_success() {
    echo -e "${GREEN}[SUCCESS] $1${NC}"
}

print_error() {
    echo -e "${RED}[ERROR] $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI not found. Please install it first."
        exit 1
    fi
    print_success "AWS CLI found"
}

check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js not found. Please install it first."
        exit 1
    fi
    print_success "Node.js found: $(node --version)"
}

check_cargo() {
    if ! command -v cargo &> /dev/null; then
        print_error "Rust/Cargo not found. Please install it first."
        exit 1
    fi
    print_success "Cargo found: $(cargo --version)"
}

deploy_frontend() {
    print_header "Deploying Frontend"
    
    check_node
    check_aws_cli
    
    cd frontend
    
    # Create production environment file
    if [ -n "$CLOUDFRONT_DOMAIN" ]; then
        print_warning "Setting VITE_API_URL to CloudFront origin: https://$CLOUDFRONT_DOMAIN"
        echo "VITE_API_URL=https://$CLOUDFRONT_DOMAIN" > .env.production
    else
        print_warning "CLOUDFRONT_DOMAIN not set; frontend will default to same-origin at runtime"
        rm -f .env.production || true
    fi
    
    # Install dependencies
    echo "Installing dependencies..."
    npm install
    
    # Build
    echo "Building frontend..."
    npm run build
    print_success "Frontend built successfully"
    
    # Deploy to S3
    echo "Uploading to S3..."
    aws s3 sync dist/ "s3://$S3_BUCKET/" --delete
    print_success "Uploaded to S3"
    
    # Invalidate CloudFront cache
    if [ "$CLOUDFRONT_DIST_ID" != "YOUR_DISTRIBUTION_ID" ]; then
        echo "Invalidating CloudFront cache..."
        aws cloudfront create-invalidation \
            --distribution-id "$CLOUDFRONT_DIST_ID" \
            --paths "/*" > /dev/null
        print_success "CloudFront cache invalidated"
    else
        print_warning "CloudFront distribution ID not set, skipping cache invalidation"
    fi
    
    cd ..
    print_success "Frontend deployment complete"
}

deploy_backend() {
    print_header "Deploying Backend"
    
    check_cargo
    
    cd backend
    
    # Build release
    echo "Building backend (this may take a while)..."
    cargo build --release
    print_success "Backend built successfully"
    
    # Copy to EC2
    if [ "$EC2_HOST" != "ubuntu@your-ec2-ip" ]; then
        echo "Stopping backend service..."
        ssh -i "$EC2_KEY" "$EC2_HOST" "sudo systemctl stop dashboard-backend" || true
        
        echo "Uploading binary to EC2..."
        scp -i "$EC2_KEY" target/release/stateful-dashboard-backend "$EC2_HOST":~/
        
        echo "Starting backend service..."
        ssh -i "$EC2_KEY" "$EC2_HOST" "sudo systemctl start dashboard-backend"
        
        print_success "Backend deployed and started"
        
        # Check health
        sleep 3
        echo "Checking backend health..."
        if ssh -i "$EC2_KEY" "$EC2_HOST" "curl -f http://localhost:8080/health" > /dev/null 2>&1; then
            print_success "Backend is healthy"
        else
            print_error "Backend health check failed"
        fi
    else
        print_warning "EC2 host not configured, skipping deployment to server"
        print_warning "Binary built at: backend/target/release/stateful-dashboard-backend"
    fi
    
    cd ..
    print_success "Backend deployment complete"
}

deploy_simulator() {
    print_header "Deploying Simulator"
    
    if [ "$EC2_HOST" != "ubuntu@your-ec2-ip" ]; then
        echo "Uploading simulator to EC2..."
        scp -i "$EC2_KEY" simulate-app.py "$EC2_HOST":~/
        print_success "Simulator deployed"
        
        echo "Testing simulator..."
        ssh -i "$EC2_KEY" "$EC2_HOST" "python3 ~/simulate-app.py" && print_success "Simulator test successful" || print_warning "Simulator test failed"
    else
        print_warning "EC2 host not configured, skipping simulator deployment"
    fi
}

show_usage() {
    echo "Usage: $0 [frontend|backend|simulator|all]"
    echo ""
    echo "Commands:"
    echo "  frontend   - Build and deploy frontend to S3/CloudFront"
    echo "  backend    - Build and deploy backend to EC2"
    echo "  simulator  - Deploy CloudWatch simulator to EC2"
    echo "  all        - Deploy everything"
    echo ""
    echo "Configuration:"
    echo "  Edit this script and set:"
    echo "  - S3_BUCKET"
    echo "  - CLOUDFRONT_DIST_ID"
    echo "  - EC2_HOST"
    echo "  - EC2_KEY"
    echo "  - CLOUDFRONT_DOMAIN"
}

# Main script
case "${1:-all}" in
    frontend)
        deploy_frontend
        ;;
    backend)
        deploy_backend
        ;;
    simulator)
        deploy_simulator
        ;;
    all)
        deploy_backend
        deploy_frontend
        deploy_simulator
        print_header "Deployment Complete"
        echo ""
        echo "Next steps:"
        echo "1. Visit your frontend URL to test"
        echo "2. Check backend logs: ssh -i $EC2_KEY $EC2_HOST 'sudo journalctl -u dashboard-backend -f'"
        echo "3. Verify simulator is running: ssh -i $EC2_KEY $EC2_HOST 'crontab -l'"
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
