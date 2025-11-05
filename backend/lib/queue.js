class QueueService {
  async sendMessage(queueName, message, attributes = {}) {
    throw new Error("sendMessage must be implemented");
  }

  async receiveMessage(queueName, maxMessages = 10) {
    throw new Error("receiveMessage must be implemented");
  }

  async deleteMesage(queueName, recepitHandle) {
    throw new Error("deleteMessage must be implemented");
  }
}

export default QueueService;
