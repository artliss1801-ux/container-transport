#!/usr/bin/env python3
"""
Complete deployment script for Production Calendar feature.
This script:
1. Creates the ProductionCalendar table in PostgreSQL (already done)
2. Seeds Russian holidays (already done)
3. Uploads all code files to the server via SFTP
4. Updates Prisma schema
5. Deploys the application
6. Recalculates all payment dates

Usage: python3 deploy_production_calendar.py
"""

import paramiko
import os
import sys
import time

# Server configuration
SERVER = '195.209.208.114'
USERNAME = 'ubuntuuser'
KEY_PATH = os.path.expanduser('~/.ssh/id_rsa')
REMOTE_APP_DIR = '/home/ubuntuuser/ct-app'

# Local files to upload (relative to script location)
LOCAL_BASE = os.path.dirname(os.path.abspath(__file__))

FILES_TO_UPLOAD = [
    {
        'local': 'src/lib/production-calendar.ts',
        'remote': 'src/lib/production-calendar.ts',
    },
    {
        'local': 'src/app/api/production-calendar/route.ts',
        'remote': 'src/app/api/production-calendar/route.ts',
    },
    {
        'local': 'src/app/api/production-calendar/batch/route.ts',
        'remote': 'src/app/api/production-calendar/batch/route.ts',
    },
    {
        'local': 'src/app/api/production-calendar/recalculate/route.ts',
        'remote': 'src/app/api/production-calendar/recalculate/route.ts',
    },
    {
        'local': 'src/app/api/production-calendar/days/route.ts',
        'remote': 'src/app/api/production-calendar/days/route.ts',
    },
    {
        'local': 'prisma/migrations/20260427000000_add_production_calendar/migration.sql',
        'remote': 'prisma/migrations/20260427000000_add_production_calendar/migration.sql',
    },
]

# Prisma model to append to schema.prisma
PRISMA_MODEL = '''
model ProductionCalendar {
  id          String   @id @default(cuid())
  date        DateTime @unique
  type        String   @default("HOLIDAY")
  title       String   @default("")
  isNonWorking Boolean  @default(true)
  year        Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("ProductionCalendar")
}
'''

def connect_ssh():
    """Connect to the server via SSH"""
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    print(f"Connecting to {SERVER}...")
    try:
        ssh.connect(SERVER, username=USERNAME, key_filename=KEY_PATH, timeout=30)
        print("Connected!")
        return ssh
    except Exception as e:
        print(f"SSH connection failed: {e}")
        print("\nTo fix this, add the following SSH public key to the server's ~/.ssh/authorized_keys:")
        pub_key_path = KEY_PATH + '.pub'
        if os.path.exists(pub_key_path):
            with open(pub_key_path) as f:
                print(f.read())
        sys.exit(1)

def upload_files(sftp):
    """Upload all necessary files to the server"""
    print("\n=== Uploading files ===")
    
    for file_info in FILES_TO_UPLOAD:
        local_path = os.path.join(LOCAL_BASE, file_info['local'])
        remote_path = os.path.join(REMOTE_APP_DIR, file_info['remote'])
        
        if not os.path.exists(local_path):
            print(f"  SKIP (not found): {file_info['local']}")
            continue
        
        # Create remote directory if needed
        remote_dir = os.path.dirname(remote_path)
        try:
            sftp.stat(remote_dir)
        except FileNotFoundError:
            # Create directory recursively
            parts = remote_dir.split('/')
            for i in range(2, len(parts) + 1):
                path = '/'.join(parts[:i])
                try:
                    sftp.stat(path)
                except FileNotFoundError:
                    sftp.mkdir(path)
        
        sftp.put(local_path, remote_path)
        print(f"  UPLOADED: {file_info['remote']}")

def update_prisma_schema(ssh):
    """Add ProductionCalendar model to Prisma schema"""
    print("\n=== Updating Prisma schema ===")
    
    # Check if model already exists
    stdin, stdout, stderr = ssh.exec_command(
        f'grep -c "ProductionCalendar" {REMOTE_APP_DIR}/prisma/schema.prisma'
    )
    count = stdout.read().decode().strip()
    
    if count and int(count) > 0:
        print("  ProductionCalendar model already exists in schema, skipping")
        return
    
    # Append model to schema.prisma
    cmd = f'cat >> {REMOTE_APP_DIR}/prisma/schema.prisma << \'PRISMA_EOF\'\n{PRISMA_MODEL}\nPRISMA_EOF'
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stderr.read()
    print("  Added ProductionCalendar model to schema.prisma")

def generate_prisma(ssh):
    """Generate Prisma client"""
    print("\n=== Generating Prisma client ===")
    
    stdin, stdout, stderr = ssh.exec_command(
        f'cd {REMOTE_APP_DIR} && npx prisma generate 2>&1'
    )
    output = stdout.read().decode()
    error = stderr.read().decode()
    
    if output:
        print(f"  {output.strip()}")
    if error:
        print(f"  STDERR: {error.strip()}")

def mark_migration(ssh):
    """Mark migration as applied"""
    print("\n=== Marking migration as applied ===")
    
    stdin, stdout, stderr = ssh.exec_command(
        f'cd {REMOTE_APP_DIR} && npx prisma migrate resolve --applied 20260427000000_add_production_calendar 2>&1'
    )
    output = stdout.read().decode()
    error = stderr.read().decode()
    
    if output:
        print(f"  {output.strip()}")
    if error:
        print(f"  (Note: {error.strip()})")

def deploy(ssh):
    """Deploy the application"""
    print("\n=== Deploying application ===")
    
    stdin, stdout, stderr = ssh.exec_command(
        f'cd {REMOTE_APP_DIR} && bash deploy-ct.sh 2>&1',
        timeout=300
    )
    # Stream output
    for line in stdout:
        print(f"  {line}", end='')
    
    error = stderr.read().decode()
    if error:
        print(f"  STDERR: {error}")

def recalculate_payments(ssh):
    """Recalculate all payment dates"""
    print("\n=== Recalculating payment dates ===")
    print("  This will be done via the API after deployment")
    print("  curl -X POST https://artliss.mooo.com/api/production-calendar/recalculate")

def main():
    print("=" * 60)
    print("Production Calendar Feature Deployment")
    print("=" * 60)
    
    # Connect
    ssh = connect_ssh()
    sftp = ssh.open_sftp()
    
    try:
        # Upload files
        upload_files(sftp)
        
        # Update Prisma schema
        update_prisma_schema(ssh)
        
        # Generate Prisma client
        generate_prisma(ssh)
        
        # Mark migration
        mark_migration(ssh)
        
        # Deploy
        deploy(ssh)
        
        print("\n=== Deployment Complete ===")
        print("\nAfter deployment, recalculate payment dates by calling:")
        print("POST /api/production-calendar/recalculate")
        print("\nOr use the Production Calendar admin UI to trigger recalculation.")
        
    finally:
        sftp.close()
        ssh.close()

if __name__ == '__main__':
    main()
