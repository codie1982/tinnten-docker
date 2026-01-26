#!/bin/bash

# Configuration
CONTAINER_NAME="tinnten-mongodb-public"
SCRIPT_PATH="./scripts/create-dbs.js"

# Check if container is running
if [ ! "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
    echo "Error: Container $CONTAINER_NAME is not running."
    echo "Please run: docker-compose up -d $CONTAINER_NAME"
    exit 1
fi

echo "Running database creation script on $CONTAINER_NAME..."

# Execute the script inside the container using mongosh
# Using the admin root credentials defined in docker-compose for the public container
docker exec -i $CONTAINER_NAME mongosh -u admin -p PublicMongoPassword123! --authenticationDatabase admin < $SCRIPT_PATH

echo "Done."
