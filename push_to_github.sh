#!/bin/bash
git remote set-url origin https://github.com/OuincheWinch/Challenge-Rank.git
echo "Fetching changes from GitHub..."
git fetch origin

echo "Pushing code to GitHub (FORCE)..."
# Using -f in case of history mismatch (e.g. repo created with README vs local)
git push -f -u origin main
