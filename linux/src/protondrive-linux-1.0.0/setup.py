#!/usr/bin/env python3

from setuptools import setup, find_packages

setup(
    name="protondrive-linux",
    version="1.0.0",
    description="ProtonDrive Linux GUI Client",
    long_description=open("README.md").read(),
    long_description_content_type="text/markdown",
    author="donniedice",
    author_email="donniedice@protonmail.com",
    url="https://github.com/donniedice/protondrive-linux",
    packages=find_packages(),
    entry_points={
        "console_scripts": [
            "protondrive-gui=protondrive:main",
        ],
    },
    install_requires=[
        "tkinter",
    ],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: End Users/Desktop",
        "License :: OSI Approved :: GNU General Public License v3 (GPLv3)",
        "Operating System :: POSIX :: Linux",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
    ],
    python_requires=">=3.8",
)