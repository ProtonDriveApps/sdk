"""
ProtonDrive Linux Client
"""

__version__ = "1.0.0"
__author__ = "donniedice"
__email__ = "donniedice@protonmail.com"

def main():
    """Entry point for the protondrive-gui command"""
    import sys
    import os
    sys.path.insert(0, os.path.dirname(__file__))
    
    from .gui import ProtonDriveGUI
    import tkinter as tk
    
    root = tk.Tk()
    app = ProtonDriveGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()