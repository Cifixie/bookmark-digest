#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { BookmarkDigest } from "../lib/bookmark-digest-stack";

const app = new cdk.App();
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION;

if (!account || !region) {
  throw new Error(
    "CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION must be set in the environment",
  );
}

new BookmarkDigest(app, "BookmarkDigest", { env: { account, region } });
