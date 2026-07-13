/**
 * Generates a premium, responsive HTML email template for user welcome emails.
 * Uses inline CSS for maximum compatibility across various email clients.
 *
 * @param firstName User's first name
 * @param lastName User's last name
 * @returns HTML template string
 */
export const getWelcomeEmailTemplate = (firstName: string, lastName: string): string => {
  const fullName = `${firstName} ${lastName}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Buddy Script Social Media App</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #334155;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #f8fafc;
      padding: 40px 0;
    }
    .main-container {
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      border: 1px solid #f1f5f9;
    }
    .header {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      padding: 48px 32px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }
    .header p {
      color: #e0e7ff;
      margin: 8px 0 0 0;
      font-size: 16px;
    }
    .content {
      padding: 40px 32px;
    }
    .greeting {
      font-size: 20px;
      font-weight: 600;
      color: #0f172a;
      margin-bottom: 16px;
    }
    .body-text {
      font-size: 16px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 24px;
    }
    .cta-container {
      text-align: center;
      margin: 32px 0;
    }
    .cta-button {
      display: inline-block;
      padding: 14px 32px;
      background-color: #4f46e5;
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2), 0 2px 4px -1px rgba(79, 70, 229, 0.10);
      transition: background-color 0.2s;
    }
    .footer {
      background-color: #f1f5f9;
      padding: 24px 32px;
      text-align: center;
      font-size: 14px;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
    }
    .footer a {
      color: #4f46e5;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="main-container">
      <div class="header">
        <h1>Welcome to Buddy Script Social Media App</h1>
        <p>Your journey to connecting and sharing starts here</p>
      </div>
      <div class="content">
        <div class="greeting">Hello, ${fullName}!</div>
        <p class="body-text">
          Thank you for registering on our platform! We are absolutely thrilled to have you join our community.
          Our app allows you to share updates, connect with friends, and discover new stories every day.
        </p>
        <p class="body-text">
          Get started today by completing your profile, searching for friends, and creating your very first post!
        </p>
        <div class="cta-container">
          <a href="#" class="cta-button">Go to Dashboard</a>
        </div>
        <p class="body-text" style="margin-bottom: 0;">
          If you have any questions, feel free to reply to this email. We're always here to help.
        </p>
      </div>
      <div class="footer">
        <p style="margin: 0 0 8px 0;">&copy; ${new Date().getFullYear()} Buddy Script Social Media App. All rights reserved.</p>
        <p style="margin: 0;">You received this email because you registered on our platform. <a href="#">Unsubscribe</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
};
