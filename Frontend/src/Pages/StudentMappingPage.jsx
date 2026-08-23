import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Users, Link as LinkIcon, RefreshCw } from 'lucide-react';
import { usePageHeader } from '../context/PageHeaderContext';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import PageTransition from '../components/ui/PageTransition';
import api from '../Api/axiosClient';

const StudentMappingPage = () => {
  usePageHeader({ title: 'Student Mapping', subtitle: 'Map existing students to academic classes' });

  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStudents, setSelectedStudents] = useState(new Set());
  const [isMapping, setIsMapping] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resStudents, resClasses] = await Promise.all([
        api.get('/api/students'),
        api.get('/api/classes')
      ]);
      setStudents(resStudents.data.data);
      setClasses(resClasses.data.data);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const unmappedStudents = students.filter(s => !s.class_id && !s.class_ids);

  const toggleStudent = (id) => {
    const newSet = new Set(selectedStudents);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedStudents(newSet);
  };

  const toggleAll = () => {
    if (selectedStudents.size === unmappedStudents.length) {
      setSelectedStudents(new Set());
    } else {
      setSelectedStudents(new Set(unmappedStudents.map(s => s.id)));
    }
  };

  const handleMapStudents = async () => {
    if (!selectedClass) {
      toast.error('Please select an Academic Class first.');
      return;
    }
    if (selectedStudents.size === 0) {
      toast.error('Please select at least one student to map.');
      return;
    }
    setIsMapping(true);
    try {
      const classObj = classes.find(c => c.id.toString() === selectedClass);
      
      for (const studentId of selectedStudents) {
        await api.post(`/api/students/${studentId}/map`, {
          classId: classObj.id,
          programId: classObj.program_id,
          sessionId: classObj.academic_session_id,
          semester: classObj.semester,
          section: classObj.section
        });
      }
      
      toast.success(`Successfully mapped ${selectedStudents.size} students!`);
      setSelectedStudents(new Set());
      fetchData();
    } catch (err) {
      toast.error('Error during mapping.');
    } finally {
      setIsMapping(false);
    }
  };

  return (
    <PageTransition>
      <div>
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-blue-500/10 to-indigo-500/10 p-8 mb-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-xl">
              <Users className="h-8 w-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Student Mapping Workflow</h2>
              <p className="mt-1 text-sm text-muted-foreground">Identify unmapped students and assign them to their academic classes safely.</p>
            </div>
          </div>
          <button onClick={fetchData} className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium transition hover:bg-secondary">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Unmapped Students ({unmappedStudents.length})</h3>
              <div className="text-sm text-muted-foreground">Select students below</div>
            </div>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading students...</div>
            ) : unmappedStudents.length === 0 ? (
              <div className="text-sm text-green-600 font-medium py-4">All students are correctly mapped!</div>
            ) : (
              <div className="overflow-x-auto max-h-[600px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                    <TableRow>
                      <TableHead className="w-12">
                        <input type="checkbox" checked={selectedStudents.size === unmappedStudents.length && unmappedStudents.length > 0} onChange={toggleAll} className="rounded border-border bg-transparent" />
                      </TableHead>
                      <TableHead>Registration No.</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unmappedStudents.map(student => (
                      <TableRow key={student.id}>
                        <TableCell>
                          <input type="checkbox" checked={selectedStudents.has(student.id)} onChange={() => toggleStudent(student.id)} className="rounded border-border bg-transparent" />
                        </TableCell>
                        <TableCell className="font-medium">{student.registration_number}</TableCell>
                        <TableCell>{student.name}</TableCell>
                        <TableCell>
                          {student.semester_id ? <Badge variant="warning">Legacy</Badge> : <Badge variant="secondary">Marks Import</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 flex flex-col">
            <h3 className="text-lg font-bold mb-4">Map Selected Students</h3>
            <div className="mb-6 flex-1">
              <label className="block text-sm font-medium text-foreground mb-2">Target Academic Class</label>
              <Select value={selectedClass} onValueChange={setSelectedClass}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select Class..." />
                </SelectTrigger>
                <SelectContent>
                  {classes.map(c => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      Sem {c.semester} - Sec {c.section || 'N/A'} (Prog: {c.program_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={handleMapStudents}
              disabled={isMapping || selectedStudents.size === 0 || !selectedClass}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-50"
            >
              {isMapping ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
              {isMapping ? 'Mapping...' : `Map ${selectedStudents.size} Students`}
            </button>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default StudentMappingPage;
