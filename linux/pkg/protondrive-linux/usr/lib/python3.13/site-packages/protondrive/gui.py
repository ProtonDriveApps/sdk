#!/usr/bin/env python3
"""
ProtonDrive Linux GUI Client
A simple GUI wrapper around rclone for ProtonDrive functionality
"""

import sys
import os
import subprocess
import tkinter as tk
from tkinter import ttk, filedialog, messagebox, simpledialog
import threading
import configparser

class ProtonDriveGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("ProtonDrive Linux Client")
        self.root.geometry("600x500")
        
        # Check if rclone is available
        if not self.check_rclone():
            messagebox.showerror("Error", "rclone is not installed. Please install rclone first.")
            sys.exit(1)
        
        self.setup_ui()
        
    def check_rclone(self):
        try:
            subprocess.run(["rclone", "version"], capture_output=True, check=True)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    
    def setup_ui(self):
        # Main frame
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Configuration section
        config_frame = ttk.LabelFrame(main_frame, text="Configuration", padding="10")
        config_frame.grid(row=0, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(0, 10))
        
        ttk.Label(config_frame, text="ProtonMail Email:").grid(row=0, column=0, sticky=tk.W)
        self.email_var = tk.StringVar()
        self.email_entry = ttk.Entry(config_frame, textvariable=self.email_var, width=40)
        self.email_entry.grid(row=0, column=1, padx=(10, 0))
        
        ttk.Label(config_frame, text="Password:").grid(row=1, column=0, sticky=tk.W, pady=(10, 0))
        self.password_var = tk.StringVar()
        self.password_entry = ttk.Entry(config_frame, textvariable=self.password_var, show="*", width=40)
        self.password_entry.grid(row=1, column=1, padx=(10, 0), pady=(10, 0))
        
        self.config_btn = ttk.Button(config_frame, text="Configure ProtonDrive", command=self.configure_remote)
        self.config_btn.grid(row=2, column=0, columnspan=2, pady=(10, 0))
        
        # Actions section
        actions_frame = ttk.LabelFrame(main_frame, text="Actions", padding="10")
        actions_frame.grid(row=1, column=0, columnspan=2, sticky=(tk.W, tk.E), pady=(0, 10))
        
        self.sync_btn = ttk.Button(actions_frame, text="Sync Local Folder", command=self.sync_folder)
        self.sync_btn.grid(row=0, column=0, padx=(0, 10))
        
        self.browse_btn = ttk.Button(actions_frame, text="Browse ProtonDrive", command=self.browse_remote)
        self.browse_btn.grid(row=0, column=1, padx=(0, 10))
        
        self.mount_btn = ttk.Button(actions_frame, text="Mount as Drive", command=self.mount_drive)
        self.mount_btn.grid(row=0, column=2)
        
        # Output section
        output_frame = ttk.LabelFrame(main_frame, text="Output", padding="10")
        output_frame.grid(row=2, column=0, columnspan=2, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        self.output_text = tk.Text(output_frame, height=15, width=70)
        scrollbar = ttk.Scrollbar(output_frame, orient="vertical", command=self.output_text.yview)
        self.output_text.configure(yscrollcommand=scrollbar.set)
        
        self.output_text.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        scrollbar.grid(row=0, column=1, sticky=(tk.N, tk.S))
        
        # Configure grid weights
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=1)
        main_frame.rowconfigure(2, weight=1)
        output_frame.columnconfigure(0, weight=1)
        output_frame.rowconfigure(0, weight=1)
        
        # Load existing config
        self.load_config()
    
    def load_config(self):
        try:
            result = subprocess.run(["rclone", "config", "show", "protondrive"], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                for line in result.stdout.split('\n'):
                    if line.startswith('user ='):
                        self.email_var.set(line.split('=')[1].strip())
                        break
        except Exception as e:
            self.log(f"Could not load existing config: {e}")
    
    def configure_remote(self):
        email = self.email_var.get().strip()
        password = self.password_var.get().strip()
        
        if not email or not password:
            messagebox.showerror("Error", "Please enter both email and password")
            return
        
        def config_thread():
            try:
                # Create rclone config
                config_cmd = [
                    "rclone", "config", "create", "protondrive", "protondrive",
                    f"user={email}", f"pass={password}"
                ]
                
                result = subprocess.run(config_cmd, capture_output=True, text=True)
                
                if result.returncode == 0:
                    self.log("✓ ProtonDrive configured successfully!")
                else:
                    self.log(f"Configuration failed: {result.stderr}")
                    
            except Exception as e:
                self.log(f"Error configuring ProtonDrive: {e}")
        
        threading.Thread(target=config_thread, daemon=True).start()
    
    def sync_folder(self):
        local_folder = filedialog.askdirectory(title="Select folder to sync")
        if not local_folder:
            return
        
        remote_folder = simpledialog.askstring("Remote Folder", "Enter ProtonDrive folder name:")
        if not remote_folder:
            remote_folder = ""
        
        def sync_thread():
            try:
                cmd = ["rclone", "sync", local_folder, f"protondrive:{remote_folder}", "-v"]
                self.log(f"Syncing {local_folder} to protondrive:{remote_folder}")
                
                process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
                
                for line in process.stdout:
                    self.log(line.strip())
                
                process.wait()
                
                if process.returncode == 0:
                    self.log("✓ Sync completed successfully!")
                else:
                    self.log("✗ Sync failed!")
                    
            except Exception as e:
                self.log(f"Error during sync: {e}")
        
        threading.Thread(target=sync_thread, daemon=True).start()
    
    def browse_remote(self):
        def browse_thread():
            try:
                result = subprocess.run(["rclone", "ls", "protondrive:"], 
                                      capture_output=True, text=True)
                
                if result.returncode == 0:
                    self.log("ProtonDrive contents:")
                    self.log(result.stdout)
                else:
                    self.log(f"Error browsing ProtonDrive: {result.stderr}")
                    
            except Exception as e:
                self.log(f"Error browsing ProtonDrive: {e}")
        
        threading.Thread(target=browse_thread, daemon=True).start()
    
    def mount_drive(self):
        mount_point = filedialog.askdirectory(title="Select mount point")
        if not mount_point:
            return
        
        def mount_thread():
            try:
                cmd = ["rclone", "mount", "protondrive:", mount_point, "--daemon"]
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode == 0:
                    self.log(f"✓ ProtonDrive mounted at {mount_point}")
                else:
                    self.log(f"Mount failed: {result.stderr}")
                    
            except Exception as e:
                self.log(f"Error mounting ProtonDrive: {e}")
        
        threading.Thread(target=mount_thread, daemon=True).start()
    
    def log(self, message):
        self.output_text.insert(tk.END, message + "\n")
        self.output_text.see(tk.END)
        self.root.update_idletasks()

def main():
    """Entry point for the application"""
    root = tk.Tk()
    app = ProtonDriveGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()