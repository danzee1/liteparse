#!/bin/bash

echo "Installing homebrew-npm-noob tool"
uv tool install --upgrade homebrew-npm-noob
echo "Setting up repository locally"
git clone https://x-access-token:${GITHUB_TOKEN}@github.com/run-llama/homebrew-liteparse
cd homebrew-liteparse
mkdir -p Formula/
echo "Generating HomeBrew Formula"
noob @llamaindex/liteparse > Formula/llamaindex-liteparse.rb
echo "Configuring GitHub user"
git config user.email "github-actions[bot]@users.noreply.github.com"
git config user.name "github-actions[bot]"
echo "Pushing to GitHub"
git add .
git commit -m "Automated HomeBrew Release for liteparse"
git push -u origin main
echo "Removing local copy"
cd ..
rm -rf homebrew-liteparse
