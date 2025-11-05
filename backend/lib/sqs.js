import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import QueueService from "./queue.js";

class SQSService extends QueueService {
  constructor() {
    super();
    const config = {
      region: process.env.AWS_REGION || "us-east-1",
    };

    if (process.env.SQS_ENDPOINT) {
      config.endpoint = process.env.SQS_ENDPOINT;
      config.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
      };
    }
    this.client = new SQSClient(config);
    this.queues = {
      orders: process.env.SQS_ORDER_QUEUE_URL,
    };
  }

  async sendMessage(queueName, message, attributes = {}) {
    const queueUrl = this.queues[queueName];
    if (!queueUrl) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const messageAttributes = {};
    Object.keys(attributes).forEach((key) => {
      messageAttributes[key] = {
        DataType: "String",
        StringValue: String(attributes[key]),
      };
    });

    const params = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
      MessageAttributes: messageAttributes,
    };

    try {
      const command = new SendMessageCommand(params);
      const response = await this.client.send(command);
      return response;
    } catch (error) {
      console.error(`Error sending message to queue ${queueName}`, error);
      throw error;
    }
  }
  async receiveMessage(queueName, maxMessages = 10) {
    const queueUrl = this.queues[queueName];
    if (!queueUrl) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const params = {
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: 20, //Long polling
      VisibilityTimeout: 300, //5 min
    };

    try {
      const command = new ReceiveMessageCommand(params);
      const response = await this.client.send(command);
      return response.Messages || [];
    } catch (error) {
      console.error(`Error receiving message from queue ${queueName}`, error);
      throw error;
    }
  }
  async deleteMesage(queueName, recepitHandle) {
    const queueUrl = this.queues[queueName];
    if (!queueUrl) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const params = {
      QueueUrl: queueUrl,
      ReceiptHandle: recepitHandle,
    };

    try {
      const command = new DeleteMessageCommand(params);
      await this.client.send(command);
    } catch (error) {
      console.error(`Error deleting message from queue ${queueName}`, error);
      throw error;
    }
  }
}

let queueService = null;

export const getQueueService = () => {
  if (!queueService) {
    queueService = new SQSService();
  }
  return queueService;
};

export default SQSService;
