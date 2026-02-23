import os
import shutil

class FileManager:
    def __init__(self, root_dir):
        self.root_dir = os.path.abspath(root_dir)
        if not os.path.exists(self.root_dir):
            os.makedirs(self.root_dir)

    def list_files(self):
        files = []
        for filename in os.listdir(self.root_dir):
            filepath = os.path.join(self.root_dir, filename)
            if os.path.isfile(filepath):
                size = os.path.getsize(filepath)
                files.append({'name': filename, 'size': size})
        return files

    def save_file(self, file_storage):
        filename = file_storage.filename
        # Basic security check
        if '..' in filename or filename.startswith('/'):
            return False, "Invalid filename"

        filepath = os.path.join(self.root_dir, filename)
        file_storage.save(filepath)
        return True, filename

    def delete_file(self, filename):
        if '..' in filename or filename.startswith('/'):
            return False, "Invalid filename"

        filepath = os.path.join(self.root_dir, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
            return True, "Deleted"
        return False, "Not found"
