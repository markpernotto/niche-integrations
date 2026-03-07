<?php
/**
 * Plugin Name: Niche Lead Capture
 * Plugin URI: https://github.com/your-org/niche-integrations
 * Description: Captures form submissions and sends them to Niche via webhook
 * Version: 1.0.0
 * Author: Your Name
 * Author URI: https://yourwebsite.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: niche-lead-capture
 */

// Exit if accessed directly
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Main plugin class
 */
class Niche_Lead_Capture {
    
    private $webhook_url;
    private $business_id;
    
    public function __construct() {
        // Get settings from WordPress options
        $this->webhook_url = get_option('niche_webhook_url', '');
        $this->business_id = get_option('niche_business_id', '');
        
        // Hook into form submissions
        add_action('wpcf7_mail_sent', array($this, 'handle_contact_form_7'));
        add_action('wpforms_process_complete', array($this, 'handle_wpforms'), 10, 4);
        add_action('gform_after_submission', array($this, 'handle_gravity_forms'), 10, 2);
        
        // Admin settings
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
    }
    
    /**
     * Handle Contact Form 7 submissions
     * Maps CF7 default field names (your-name, your-email, etc.) to name, email, message for the webhook.
     */
    public function handle_contact_form_7($contact_form) {
        $submission = WPCF7_Submission::get_instance();
        if ($submission) {
            $posted_data = $submission->get_posted_data();
            $mapped = array(
                'name'    => isset($posted_data['your-name']) ? $posted_data['your-name'] : (isset($posted_data['name']) ? $posted_data['name'] : ''),
                'email'   => isset($posted_data['your-email']) ? $posted_data['your-email'] : (isset($posted_data['email']) ? $posted_data['email'] : ''),
                'phone'   => isset($posted_data['your-phone']) ? $posted_data['your-phone'] : (isset($posted_data['phone']) ? $posted_data['phone'] : ''),
                'message' => isset($posted_data['your-message']) ? $posted_data['your-message'] : (isset($posted_data['message']) ? $posted_data['message'] : ''),
            );
            $this->send_to_niche(array_filter($mapped));
        }
    }
    
    /**
     * Handle WPForms submissions
     */
    public function handle_wpforms($fields, $entry, $form_data, $entry_id) {
        $formatted_data = array();
        foreach ($fields as $field_id => $field) {
            $label = isset($field['name']) ? $field['name'] : $field['label'];
            $value = isset($field['value']) ? $field['value'] : '';
            
            // Map common field names
            $key = strtolower($label);
            if (strpos($key, 'name') !== false || strpos($key, 'full name') !== false) {
                $formatted_data['name'] = $value;
            } elseif (strpos($key, 'email') !== false) {
                $formatted_data['email'] = $value;
            } elseif (strpos($key, 'phone') !== false || strpos($key, 'tel') !== false) {
                $formatted_data['phone'] = $value;
            } elseif (strpos($key, 'message') !== false || strpos($key, 'comment') !== false) {
                $formatted_data['message'] = $value;
            } else {
                $formatted_data[$label] = $value;
            }
        }
        $this->send_to_niche($formatted_data);
    }
    
    /**
     * Handle Gravity Forms submissions
     */
    public function handle_gravity_forms($entry, $form) {
        $formatted_data = array();
        foreach ($form['fields'] as $field) {
            $label = $field->label;
            $value = rgar($entry, $field->id);
            
            // Map common field names
            $key = strtolower($label);
            if (strpos($key, 'name') !== false || strpos($key, 'full name') !== false) {
                $formatted_data['name'] = $value;
            } elseif (strpos($key, 'email') !== false) {
                $formatted_data['email'] = $value;
            } elseif (strpos($key, 'phone') !== false || strpos($key, 'tel') !== false) {
                $formatted_data['phone'] = $value;
            } elseif (strpos($key, 'message') !== false || strpos($key, 'comment') !== false) {
                $formatted_data['message'] = $value;
            } else {
                $formatted_data[$label] = $value;
            }
        }
        $this->send_to_niche($formatted_data);
    }
    
    /**
     * Send form data to Niche webhook
     */
    private function send_to_niche($form_data) {
        if (empty($this->webhook_url) || empty($this->business_id)) {
            error_log('Niche Lead Capture: Webhook URL or Business ID not configured');
            return;
        }
        
        $payload = array_merge($form_data, array(
            'businessId' => $this->business_id,
            'source' => 'wordpress',
        ));
        
        $response = wp_remote_post($this->webhook_url, array(
            'method' => 'POST',
            'timeout' => 15,
            'headers' => array(
                'Content-Type' => 'application/json',
            ),
            'body' => json_encode($payload),
        ));
        
        if (is_wp_error($response)) {
            error_log('Niche Lead Capture Error: ' . $response->get_error_message());
        } else {
            $status_code = wp_remote_retrieve_response_code($response);
            if ($status_code !== 201) {
                $body = wp_remote_retrieve_body($response);
                error_log('Niche Lead Capture Error: HTTP ' . $status_code . ' - ' . $body);
            }
        }
    }
    
    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        add_options_page(
            'Niche Lead Capture Settings',
            'Niche Lead Capture',
            'manage_options',
            'niche-lead-capture',
            array($this, 'render_settings_page')
        );
    }
    
    /**
     * Register settings
     */
    public function register_settings() {
        register_setting('niche_lead_capture', 'niche_webhook_url');
        register_setting('niche_lead_capture', 'niche_business_id');
    }
    
    /**
     * Render settings page
     */
    public function render_settings_page() {
        ?>
        <div class="wrap">
            <h1>Niche Lead Capture Settings</h1>
            <form method="post" action="options.php">
                <?php settings_fields('niche_lead_capture'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row">
                            <label for="niche_webhook_url">Webhook URL</label>
                        </th>
                        <td>
                            <input type="url" 
                                   id="niche_webhook_url" 
                                   name="niche_webhook_url" 
                                   value="<?php echo esc_attr(get_option('niche_webhook_url')); ?>" 
                                   class="regular-text" 
                                   placeholder="https://your-webhook-url.com/webhook" />
                            <p class="description">The URL of your Niche webhook endpoint (e.g., ngrok URL during development)</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="niche_business_id">Business ID</label>
                        </th>
                        <td>
                            <input type="text" 
                                   id="niche_business_id" 
                                   name="niche_business_id" 
                                   value="<?php echo esc_attr(get_option('niche_business_id')); ?>" 
                                   class="regular-text" 
                                   placeholder="your-business-id" />
                            <p class="description">Your Niche Business ID (found in your Niche dashboard)</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }
}

// Initialize plugin
new Niche_Lead_Capture();
