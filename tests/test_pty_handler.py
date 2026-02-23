import unittest
from unittest.mock import patch, MagicMock
import os
from utils.pty_handler import PTYManager

class TestPTYManager(unittest.TestCase):
    def setUp(self):
        self.manager = PTYManager()

    @patch('pty.openpty')
    @patch('subprocess.Popen')
    @patch('os.close')
    def test_spawn(self, mock_close, mock_popen, mock_openpty):
        mock_openpty.return_value = (10, 11)
        mock_popen.return_value = MagicMock()

        fd = self.manager.spawn("sid1", "term1")
        self.assertEqual(fd, 10)
        self.assertIn(("sid1", "term1"), self.manager.sessions)
        mock_close.assert_called_with(11)

    @patch('os.write')
    @patch('pty.openpty')
    @patch('subprocess.Popen')
    @patch('os.close')
    def test_write_success(self, mock_close, mock_popen, mock_openpty, mock_write):
        # Setup session
        mock_openpty.return_value = (10, 11)
        mock_popen.return_value = MagicMock()
        self.manager.spawn("sid1", "term1")

        # Call write
        self.manager.write("sid1", "term1", "test data")

        mock_write.assert_called_once_with(10, b"test data")

    @patch('os.write')
    @patch('pty.openpty')
    @patch('subprocess.Popen')
    @patch('os.close')
    def test_write_oserror_handled(self, mock_close, mock_popen, mock_openpty, mock_write):
        # Setup session
        mock_openpty.return_value = (10, 11)
        mock_popen.return_value = MagicMock()
        self.manager.spawn("sid1", "term1")

        # Simulate OSError on os.write
        mock_write.side_effect = OSError("Simulated error")

        # Call write - should not raise exception
        try:
            self.manager.write("sid1", "term1", "test data")
        except OSError:
            self.fail("PTYManager.write raised OSError instead of handling it")

        mock_write.assert_called_once_with(10, b"test data")

    @patch('os.write')
    def test_write_no_session(self, mock_write):
        # Call write on non-existent session
        self.manager.write("sid1", "term1", "test data")
        mock_write.assert_not_called()

if __name__ == '__main__':
    unittest.main()
