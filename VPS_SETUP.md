# VPS Deployment Guide

## Prerequisites
- Ubuntu 20.04+ VPS
- Domain name pointed to your VPS IP (optional but recommended)
- SSH access to your VPS

## Quick Setup

### 1. Connect to VPS
```bash
ssh root@your-vps-ip
```

### 2. Create a User (if running as root)
```bash
adduser tww
usermod -aG sudo tww
su - tww
```

### 3. Install Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Install Git
sudo apt install -y git
```

### 4. Clone Repository
```bash
cd /var/www
sudo mkdir -p tww
sudo chown $USER:$USER tww
cd tww
git clone https://github.com/gerritsxd/tww25.git .
```

### 5. Install App Dependencies
```bash
npm install --production
```

### 6. Start with PM2
```bash
# Using ecosystem file
pm2 start ecosystem.config.js

# Or simple start
pm2 start server.js --name tww

# Save PM2 process list
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command it outputs (with sudo)
```

### 7. Configure Nginx

Create nginx config:
```bash
sudo nano /etc/nginx/sites-available/tww
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    # Or use your IP: server_name 1.2.3.4;

    # Max upload size
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        proxy_cache_bypass $http_upgrade;
    }

    # Serve uploads directly
    location /uploads/ {
        alias /var/www/tww/public/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/tww /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 8. Setup SSL (Recommended)
```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is set up automatically
```

### 9. Configure Firewall
```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

## Deployment

After initial setup, deploy updates with:

```bash
cd /var/www/tww
./deploy.sh
```

Or manually:
```bash
git pull origin main
npm install --production
pm2 restart tww
```

## Monitoring

```bash
# View logs
pm2 logs tww

# Monitor resources
pm2 monit

# Check status
pm2 status

# Restart if needed
pm2 restart tww
```

## Troubleshooting

### App won't start
```bash
# Check logs
pm2 logs tww --lines 100

# Check if port 3000 is in use
sudo lsof -i :3000

# Restart
pm2 restart tww
```

### Nginx errors
```bash
# Check nginx config
sudo nginx -t

# View error log
sudo tail -f /var/log/nginx/error.log

# Restart nginx
sudo systemctl restart nginx
```

### Database issues
```bash
# Check if database file exists and has correct permissions
ls -la /var/www/tww/bubbles.db

# If needed, reset (WARNING: deletes all data)
rm bubbles.db
pm2 restart tww
```

### High memory usage
```bash
# Check memory
pm2 monit

# Restart to clear
pm2 restart tww

# Check for memory leaks in logs
pm2 logs tww --err
```

## Backup

### Manual backup
```bash
# Backup database
cp bubbles.db bubbles.db.backup

# Backup uploads
tar -czf uploads-backup.tar.gz public/uploads/
```

### Automated backup (cron)
```bash
crontab -e
```

Add:
```cron
# Backup database daily at 3 AM
0 3 * * * cp /var/www/tww/bubbles.db /var/www/tww/backups/bubbles-$(date +\%Y\%m\%d).db

# Clean old backups (keep 7 days)
0 4 * * * find /var/www/tww/backups/ -name "bubbles-*.db" -mtime +7 -delete
```

## Performance Optimization

### Enable gzip in Nginx
Add to `/etc/nginx/nginx.conf` in the `http` block:
```nginx
gzip on;
gzip_vary on;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss;
```

### Database optimization
The SQLite database is stored in memory and periodically saved. No additional optimization needed for small-scale deployments.

## Security

### Keep system updated
```bash
sudo apt update && sudo apt upgrade -y
```

### Monitor logs
```bash
# Check access logs for suspicious activity
sudo tail -f /var/log/nginx/access.log

# Check app logs
pm2 logs tww
```

### Rate limiting (optional)
Add to nginx config inside `location /` block:
```nginx
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
limit_req zone=api burst=20 nodelay;
```

## URLs

- **App**: http://yourdomain.com (or http://your-vps-ip)
- **GitHub**: https://github.com/gerritsxd/tww25
- **Debug Mode**: Add `?fp=username` to test multiple users

---

Need help? Check the logs first: `pm2 logs tww`

